# ── CI/CD identity + Workload Identity Federation ───────────────────────────
# GitHub Actions authenticates to GCP without a JSON key by exchanging its
# per-run OIDC token for short-lived credentials. Only this repo can impersonate
# the identity.

resource "google_service_account" "ci" {
  account_id   = "micheldev-www-ci"
  display_name = "GitHub Actions deploy identity (micheldev.com)"
}

# Project-level roles the CI needs at apply time.
resource "google_project_iam_member" "ci_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_project_iam_member" "ci_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_project_iam_member" "ci_ar_admin" {
  project = var.project_id
  role    = "roles/artifactregistry.admin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_project_iam_member" "ci_iam_admin" {
  project = var.project_id
  role    = "roles/iam.serviceAccountAdmin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_project_iam_member" "ci_wif_admin" {
  project = var.project_id
  role    = "roles/iam.workloadIdentityPoolAdmin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_project_iam_member" "ci_project_iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

# Needed because the provider sets `user_project_override = true` — every API
# call bills this project's quota, which requires this on the calling identity.
resource "google_project_iam_member" "ci_service_usage_consumer" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

# Deploying a revision requires actAs on the runtime SA.
resource "google_service_account_iam_member" "ci_can_act_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.ci.email}"
}

# Terraform state. `storage.admin` rather than `objectAdmin`: CI has to
# reconcile this very binding on subsequent applies, which needs bucket-level
# IAM permissions that objectAdmin lacks.
resource "google_storage_bucket_iam_member" "ci_tf_state" {
  bucket = "${var.project_id}-tf-state"
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.ci.email}"
}

# Budgets live at the billing-account scope, not the project — so the binding
# that lets CI manage the budget is granted once by bootstrap.sh, not from here.
#
# Managing it in Terraform is circular: reconciling this binding on every apply
# requires billing.accounts.setIamPolicy, i.e. Billing Account Administrator, on
# the very identity the binding is trying to privilege. CI would have to be a
# billing admin to be allowed to grant itself the far smaller costsManager role.
# A deploy identity for a static site has no business holding that, so the grant
# happens out-of-band, like the state bucket it also cannot create.

# WIF pool — the trust boundary for external OIDC issuers.
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "OIDC trust for GitHub Actions workflows"
}

# Provider — trusts GitHub's OIDC endpoint, restricted to this repo via
# attribute_condition as defence in depth against a token from another repo in
# the same pool.
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  # Both conditions, not just the repo: the principalSet below can only key off a
  # single attribute, so restricting the *ref* has to happen here. Without this,
  # any branch of the repo could mint a token — only the workflow's `if:` stood
  # between a feature branch and a production deploy, and that is a convention,
  # not a boundary. The deploy job is the only one that authenticates, and it
  # already runs on main alone, so nothing legitimate is turned away.
  attribute_condition = join(" && ", [
    "assertion.repository == \"${var.github_repo}\"",
    "assertion.ref == \"refs/heads/main\"",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Only the main branch of this repo may impersonate the CI identity. Tighter
# than notion-tmdb's binding, which allows any ref — there is no reason for a
# feature branch to be able to deploy a personal site.
resource "google_service_account_iam_member" "ci_wif_binding" {
  service_account_id = google_service_account.ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}
