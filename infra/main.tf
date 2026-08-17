terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # State lives in a GCS bucket created out-of-band before `terraform init`
  # (see bootstrap.sh). Pass `-backend-config="bucket=<name>"` to init.
  backend "gcs" {
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # Route API calls that don't attach to a project (billing budgets, org
  # policies) through this project's quota so they don't fail with
  # SERVICE_DISABLED against Google's default shared project.
  billing_project       = var.project_id
  user_project_override = true
}

# ── APIs ─────────────────────────────────────────────────────────────────────
# `cloudresourcemanager`, `iam` and `storage` must already be enabled before
# `terraform apply`; bootstrap.sh covers that. These are managed declaratively
# from here on.
#
# Adding one to this list is the interesting case, and it was broken until
# secretmanager needed it: enabling a service takes serviceUsageAdmin, and CI
# only had consumer. Every entry that predates that was switched on by the first
# local apply under an owner account, so CI had only ever refreshed them. The
# grant is in ci.tf now, and depends_on makes it land first — IAM still takes a
# moment to propagate, so a brand-new project may want one retry.
resource "google_project_service" "apis" {
  depends_on = [google_project_iam_member.ci_service_usage_admin]

  for_each = toset(concat([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbilling.googleapis.com",
    # Distinct from cloudbilling: reading billing info and *creating a budget*
    # are two different APIs, and only the former was enabled, so the budget in
    # budget.tf failed to create on the first apply.
    "billingbudgets.googleapis.com",
    # Only when there is a credential to store — see the block below.
  ], local.has_credentials ? ["secretmanager.googleapis.com"] : []))
  service                    = each.key
  disable_dependent_services = false
  disable_on_destroy         = false
}

# ── Service account ──────────────────────────────────────────────────────────
# The site reads nothing and writes nothing, so this identity holds no roles at
# all. It exists only so the service does not run as the default compute SA.
#
# The one exception is opt-in and off by default: setting cloudflare_api_token
# grants it accessor on that single secret, below. Everything else /stats.json
# counts — npm, Packagist, GitHub — is public and unauthenticated, and needs no
# identity of any kind.
resource "google_service_account" "runtime" {
  account_id   = "micheldev-www-runtime"
  display_name = "Cloud Run runtime identity (micheldev.com)"
}

# ── Runtime credentials ──────────────────────────────────────────────────────
# One secret, holding a JSON object, rather than one secret per credential.
#
# Cloud Run projects a secret as a single environment variable, so a secret per
# credential is also a version per credential and an IAM binding per credential,
# on an identity that is meant to hold as little as possible. Packing them means
# one of each no matter how many there are, and a third credential later is a
# key in this map rather than another block of Terraform.
#
# Every key is independently optional, and the whole thing collapses to nothing
# when none is supplied: no secret, no binding, no environment variable, and a
# runtime service account still holding no roles at all.
#
# Both gates are wrapped in nonsensitive(). They are derived from sensitive
# variables, so Terraform marks them sensitive too, and it refuses a sensitive
# value in count or for_each — those become resource instance keys, which would
# put the value in plan output and state addresses. What is unwrapped here is
# only *whether* a credential was supplied, never the credential: the keys these
# produce are the constant "secretmanager.googleapis.com" and an index of 0 or 1.
#
# terraform validate does not catch this. It checks syntax and schema without
# evaluating values, so the error appears at plan time — which for this repo
# means in CI, on main, after the merge.
locals {
  cf_analytics = nonsensitive(
    var.cloudflare_api_token != "" && var.cloudflare_zone_id != ""
  )

  runtime_credentials = merge(
    var.github_token != "" ? { github_token = var.github_token } : {},
    local.cf_analytics ? { cloudflare_api_token = var.cloudflare_api_token } : {},
  )
  has_credentials = nonsensitive(length(local.runtime_credentials) > 0)
}

resource "google_secret_manager_secret" "runtime" {
  count     = local.has_credentials ? 1 : 0
  secret_id = "micheldev-www-runtime-credentials"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "runtime" {
  count       = local.has_credentials ? 1 : 0
  secret      = google_secret_manager_secret.runtime[0].id
  secret_data = jsonencode(local.runtime_credentials)
}

# Scoped to this one secret rather than granted project-wide.
resource "google_secret_manager_secret_iam_member" "runtime" {
  count     = local.has_credentials ? 1 : 0
  secret_id = google_secret_manager_secret.runtime[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# ── Artifact Registry ────────────────────────────────────────────────────────
resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "micheldev-www"
  format        = "DOCKER"
  description   = "micheldev.com container images"

  # Images are immutable and tagged by commit SHA; keep the last handful so a
  # rollback is possible without the registry growing without bound.
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  depends_on = [google_project_service.apis]
}

# ── Cloud Run service ────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "site" {
  name                = "micheldev-www"
  location            = var.region
  deletion_protection = false

  # Cloud Run auto-populates a service-level `scaling` block (distinct from
  # `template.scaling`) with all-zero manual-instance-count values on every
  # revision. We don't manage it — ignore it so plan/apply stops flapping.
  lifecycle {
    ignore_changes = [scaling]
  }

  template {
    service_account = google_service_account.runtime.email

    # Gen1, deliberately. Gen2 refuses anything under 512Mi, and it buys full
    # Linux syscall and filesystem emulation that a Bun process reading static
    # files out of the image has no use for. What this workload is actually
    # sensitive to is cold-start latency — it scales to zero, so the first
    # visitor per Cloudflare PoP pays it — and gen1 starts faster.
    execution_environment = "EXECUTION_ENVIRONMENT_GEN1"

    # A static file server has no long requests. Anything slower than this is a
    # bug, not a big response.
    timeout = "30s"

    scaling {
      # Scale to zero: this is a personal site behind a CDN, and the origin is
      # only touched on a cache miss. Cold start for Bun serving static is a few
      # hundred milliseconds, and Cloudflare absorbs it for everyone but the
      # first visitor per PoP.
      min_instance_count = 0
      max_instance_count = 4
    }

    containers {
      image = var.image

      # A plain variable, not part of the secret: an identifier rather than a
      # credential, so the secret holds only what would matter if it leaked.
      dynamic "env" {
        for_each = local.cf_analytics ? [1] : []
        content {
          name  = "CF_ZONE_ID"
          value = var.cloudflare_zone_id
        }
      }

      # Both tokens, as one JSON object. Absent by default, and the server treats
      # absence as "those figures are unavailable" rather than as an error — the
      # same arrangement CV_EMAIL uses.
      dynamic "env" {
        for_each = local.has_credentials ? [1] : []
        content {
          name = "STATS_CREDENTIALS"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime[0].secret_id
              version = "latest"
            }
          }
        }
      }

      resources {
        # Billed only while a request is in flight.
        cpu_idle = true
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
      }

      ports {
        container_port = 8080
      }

      startup_probe {
        tcp_socket {
          port = 8080
        }
        initial_delay_seconds = 0
        period_seconds        = 1
        failure_threshold     = 10
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# Public: it is a website.
resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.site.location
  name     = google_cloud_run_v2_service.site.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Domain mappings ──────────────────────────────────────────────────────────
# All four hostnames land on this one service; the server 301s everything that
# is not the canonical apex. Cloudflare fronts these, so its DNS records point
# at Google's ghs.googlehosted.com addresses with the proxy enabled and SSL mode
# Full (strict) — Cloud Run still terminates TLS with its own managed cert.
resource "google_cloud_run_domain_mapping" "site" {
  for_each = var.enable_domain_mappings ? toset(var.mapped_domains) : toset([])

  location = var.region
  name     = each.value

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.site.name
  }
}
