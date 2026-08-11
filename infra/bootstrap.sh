#!/usr/bin/env bash
# One-time setup for a fresh GCP project, before the first `terraform apply`.
#
# Terraform cannot create the bucket that holds its own state, and it cannot
# enable the APIs it needs to enable APIs. Everything else is managed in the .tf
# files.
#
#   ./bootstrap.sh micheldev-www <billing-account-id>

set -euo pipefail

PROJECT_ID="${1:?usage: bootstrap.sh <project-id> [billing-account-id]}"
BILLING_ACCOUNT="${2:-}"
REGION="${REGION:-us-central1}"
STATE_BUCKET="${PROJECT_ID}-tf-state"

echo "==> Creating project ${PROJECT_ID} (skipped if it exists)"
# Display name, not the domain: GCP rejects "." in a project display name, and
# swallowing stderr here reported that as "already exists" for a project that had
# never been created. Test for existence, then let a real failure be a failure.
if gcloud projects describe "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "    already exists"
else
  gcloud projects create "${PROJECT_ID}" --name="${PROJECT_ID}"
fi

if [[ -n "${BILLING_ACCOUNT}" ]]; then
  echo "==> Linking billing account"
  gcloud billing projects link "${PROJECT_ID}" \
    --billing-account="${BILLING_ACCOUNT}"
fi

echo "==> Enabling the APIs Terraform needs in order to manage APIs"
gcloud services enable \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  serviceusage.googleapis.com \
  storage.googleapis.com \
  --project="${PROJECT_ID}"

echo "==> Creating the Terraform state bucket: ${STATE_BUCKET}"
if gcloud storage buckets describe "gs://${STATE_BUCKET}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "    already exists"
else
  gcloud storage buckets create "gs://${STATE_BUCKET}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --uniform-bucket-level-access
  # State history is the only backup that matters here.
  gcloud storage buckets update "gs://${STATE_BUCKET}" --versioning
fi

# Granted here rather than in Terraform because reconciling a billing-account
# binding needs billing.accounts.setIamPolicy on the caller — CI would have to be
# a billing administrator in order to grant itself the much smaller costsManager
# role. Run by a human who already has that, exactly like the state bucket above.
#
# The CI identity is created by Terraform, which has not run yet on a fresh
# project, so this is a no-op on the first pass. Re-run bootstrap.sh after the
# first apply (it is idempotent) and it completes the grant.
CI_SA="micheldev-www-ci@${PROJECT_ID}.iam.gserviceaccount.com"
NEEDS_BILLING_GRANT=""

if [[ -n "${BILLING_ACCOUNT}" ]]; then
  echo "==> Letting the CI identity manage the budget"
  if gcloud iam service-accounts describe "${CI_SA}" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud billing accounts add-iam-policy-binding "${BILLING_ACCOUNT}" \
      --member="serviceAccount:${CI_SA}" \
      --role="roles/billing.costsManager" \
      --condition=None >/dev/null
    echo "    ${CI_SA} -> roles/billing.costsManager"
  else
    NEEDS_BILLING_GRANT="yes"
    echo "    skipped: ${CI_SA} does not exist yet (Terraform creates it)"
  fi
fi

cat <<EOF

==> Bootstrap complete.

Next:

  1. Verify every domain in Search Console, using the same Google account that
     owns this project:
       micheldev.com, michelsalib.com
     Cloud Run refuses to create a domain mapping otherwise.

  2. First apply, with mappings still off:
       cd infra
       terraform init -backend-config="bucket=${STATE_BUCKET}"
       terraform apply

  3. Re-run this script, now that Terraform has created the CI identity. It is
     idempotent, and this pass grants the billing binding skipped above${NEEDS_BILLING_GRANT:+ (pending)}:
       ./bootstrap.sh ${PROJECT_ID} ${BILLING_ACCOUNT:-<billing-account-id>}
     Without it, CI's terraform apply fails 403 on the budget.

  4. Set the two repository variables GitHub Actions needs:
       gh variable set WORKLOAD_IDENTITY_PROVIDER \\
         --body "\$(terraform output -raw workload_identity_provider)"
       gh variable set CI_SERVICE_ACCOUNT \\
         --body "\$(terraform output -raw ci_service_account)"

  5. Push to main. CI builds, prints the CV PDFs, and deploys.

  6. Once the service is live, flip enable_domain_mappings to true, apply again,
     then point Cloudflare DNS at the records in the dns_records output with the
     proxy enabled and SSL mode Full (strict).
EOF
