output "config_name" {
  description = "Identity Platform config resource name."
  value       = google_identity_platform_config.default.name
}

output "google_provider_name" {
  description = "Google Identity Platform provider resource name, or null when disabled."
  value       = try(google_identity_platform_default_supported_idp_config.google[0].name, null)
}
