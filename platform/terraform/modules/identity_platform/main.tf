resource "google_identity_platform_config" "default" {
  project = var.project_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_identity_platform_default_supported_idp_config" "google" {
  count = var.google_provider_enabled ? 1 : 0

  project       = var.project_id
  enabled       = true
  idp_id        = "google.com"
  client_id     = var.google_oauth_client_id
  client_secret = var.google_oauth_client_secret

  deletion_policy = "ABANDON"

  depends_on = [google_identity_platform_config.default]

  lifecycle {
    precondition {
      condition     = var.google_oauth_client_id != null && var.google_oauth_client_secret != null
      error_message = "google_oauth_client_id and google_oauth_client_secret are required when google_provider_enabled is true."
    }
  }
}
