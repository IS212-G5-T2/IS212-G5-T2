variable "project_id" {
  description = "Google Cloud project ID where observability resources are created."
  type        = string
}

variable "region" {
  description = "Google Cloud region for observability resources that require a location."
  type        = string
}

variable "environment" {
  description = "Environment label applied to observability resources."
  type        = string
}

variable "log_bucket_id" {
  description = "Central Cloud Logging bucket ID."
  type        = string
}

variable "log_bucket_retention_days" {
  description = "Retention period in days for the central Cloud Logging bucket."
  type        = number
}

variable "enable_log_bucket_cmek" {
  description = "Whether to create and attach a CMEK key for the central logging bucket."
  type        = bool
}

variable "log_exclusion_filters" {
  description = "Project-level Cloud Logging exclusion filters keyed by exclusion name."
  type        = map(string)
}

variable "monitoring_alert_email_addresses" {
  description = "Email addresses used to create Monitoring notification channels."
  type        = set(string)
}

variable "enable_budget_alerts" {
  description = "Whether to create a Cloud Billing budget alert."
  type        = bool
}

variable "billing_account_id" {
  description = "Billing account ID used when budget alerts are enabled."
  type        = string
  nullable    = true
}

variable "monthly_budget_amount" {
  description = "Monthly budget amount used when budget alerts are enabled."
  type        = number
  nullable    = true
}

variable "budget_currency_code" {
  description = "Currency code for budget alert amounts."
  type        = string
}
