# A static site behind a CDN, scaling to zero, should cost cents. This budget is
# a tripwire for a mistake — a runaway loop, an accidental min_instance_count —
# not a spending plan.

resource "google_billing_budget" "site" {
  count = var.billing_account == "" ? 0 : 1

  billing_account = var.billing_account
  display_name    = "micheldev.com"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = "EUR"
      units         = tostring(var.budget_amount)
    }
  }

  # Warn early, then loudly. There is no automatic action: this project is
  # meant to stay up, so an alert is the right response, not a shutdown.
  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 1.0
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  depends_on = [google_project_service.apis]
}

data "google_project" "this" {
  project_id = var.project_id
}
