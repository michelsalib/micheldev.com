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
# `terraform apply`; bootstrap.sh covers that. These are safe to manage
# declaratively from here on.
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbilling.googleapis.com",
    # Distinct from cloudbilling: reading billing info and *creating a budget*
    # are two different APIs, and only the former was enabled, so the budget in
    # budget.tf failed to create on the first apply.
    "billingbudgets.googleapis.com",
  ])
  service                    = each.key
  disable_dependent_services = false
  disable_on_destroy         = false
}

# ── Service account ──────────────────────────────────────────────────────────
# The site reads nothing and writes nothing, so this identity holds no roles at
# all. It exists only so the service does not run as the default compute SA.
resource "google_service_account" "runtime" {
  account_id   = "micheldev-www-runtime"
  display_name = "Cloud Run runtime identity (micheldev.com)"
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
locals {
  domains = [
    var.domain_apex,
    "www.${var.domain_apex}",
    var.domain_alias,
    "www.${var.domain_alias}",
  ]
}

resource "google_cloud_run_domain_mapping" "site" {
  for_each = var.enable_domain_mappings ? toset(local.domains) : toset([])

  location = var.region
  name     = each.value

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.site.name
  }
}
