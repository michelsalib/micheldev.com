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
