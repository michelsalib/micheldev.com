output "service_url" {
  description = "The run.app URL. Useful for smoke tests before DNS is pointed."
  value       = google_cloud_run_v2_service.site.uri
}

output "workload_identity_provider" {
  description = "Set as the WORKLOAD_IDENTITY_PROVIDER repository variable in GitHub."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "ci_service_account" {
  description = "Set as the CI_SERVICE_ACCOUNT repository variable in GitHub."
  value       = google_service_account.ci.email
}

output "dns_records" {
  description = <<-EOT
    What to create in Cloudflare once the mappings exist. Cloud Run reports the
    exact records per mapping; these are Google's standard ghs addresses. Set the
    proxy to enabled (orange cloud) and SSL mode to Full (strict).
  EOT
  value = var.enable_domain_mappings ? {
    apex_a = [
      "216.239.32.21",
      "216.239.34.21",
      "216.239.36.21",
      "216.239.38.21",
    ]
    apex_aaaa = [
      "2001:4860:4802:32::15",
      "2001:4860:4802:34::15",
      "2001:4860:4802:36::15",
      "2001:4860:4802:38::15",
    ]
    www_cname = "ghs.googlehosted.com."
  } : null
}
