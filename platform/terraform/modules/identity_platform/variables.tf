variable "project_id" {
  description = "Google Cloud project ID where Identity Platform is configured."
  type        = string
}

variable "google_provider_enabled" {
  description = "Whether to enable the Google Identity Platform provider."
  type        = bool
}

variable "google_oauth_client_id" {
  description = "OAuth client ID for the Google Identity Platform provider."
  type        = string
  nullable    = true
  sensitive   = true
}

variable "google_oauth_client_secret" {
  description = "OAuth client secret for the Google Identity Platform provider."
  type        = string
  nullable    = true
  sensitive   = true
}
