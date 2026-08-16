variable "project_id" {
  description = "GCP project that owns the site (its own project, as with notion-tmdb)."
  type        = string
}

variable "region" {
  description = "Cloud Run region. us-central1 to match the rest of the estate; Cloudflare caches at the edge, so origin latency only shows on a cache miss."
  type        = string
  default     = "us-central1"
}

variable "image" {
  description = "Fully-qualified container image, tagged with the commit SHA."
  type        = string
}

variable "domain_apex" {
  description = "Canonical apex domain."
  type        = string
  default     = "micheldev.com"
}

variable "domain_alias" {
  description = "Secondary apex, 301-redirected to the canonical one by the server."
  type        = string
  default     = "michelsalib.com"
}

variable "mapped_domains" {
  description = <<-EOT
    Which hostnames get a Cloud Run domain mapping.

    Not simply "all four": a mapping whose DNS does not point at ghs sits with a
    pending certificate forever. michelsalib.com is on Netim nameservers, where it
    already 301s to about.me preserving path and query, so redirecting it there is
    cheaper than mapping it. Add its two hostnames here only if its DNS moves to
    records pointing at ghs.
  EOT
  type        = list(string)
  default     = ["micheldev.com", "www.micheldev.com"]
}

variable "enable_domain_mappings" {
  description = <<-EOT
    Domain mappings need every domain verified in Search Console under the same
    Google account that owns this project, and certificate provisioning takes
    15-60 minutes. Keep this false on the first apply, verify, then flip it.
  EOT
  type        = bool
  default     = false
}

variable "github_repo" {
  description = "owner/repo allowed to impersonate the CI service account."
  type        = string
}

variable "cloudflare_zone_id" {
  description = <<-EOT
    Zone id for the analytics query behind the visit count on /stats.json.

    Empty — the default — leaves the whole feature dormant: no secret, no IAM
    binding, and the server omits the figure, which the page is built to survive.
    Setting it is only half the switch; the token below is the other half.
  EOT
  type        = string
  default     = ""
}

variable "cloudflare_api_token" {
  description = <<-EOT
    A Cloudflare API token scoped to Zone > Analytics > Read on that one zone.
    Not the Global API Key, which would put full account control in a container.

    Pass it via TF_VAR_ from a CI secret; never commit it to a tfvars file.
  EOT
  type        = string
  default     = ""
  sensitive   = true
}

variable "github_token" {
  description = <<-EOT
    Raises the GitHub API limit the stats route works against from 60 requests
    an hour to 5,000. Optional: unset, the route calls GitHub anonymously and
    the figures it cannot refresh keep their last good values.

    Everything counted is public, so a fine-grained token with no permissions at
    all is the right one — it authenticates and grants nothing.

    This and cloudflare_api_token share a single Secret Manager secret as a JSON
    object; supplying either is what first gives the runtime service account a
    role, and until then it holds none at all.
  EOT
  type        = string
  default     = ""
  sensitive   = true
}

variable "billing_account" {
  description = "Billing account id, for the budget alert. Empty disables the budget."
  type        = string
  default     = ""
}

variable "budget_amount" {
  description = "Monthly budget in EUR. The site should cost effectively nothing; this exists to catch a mistake, not to fund one."
  type        = number
  default     = 5
}
