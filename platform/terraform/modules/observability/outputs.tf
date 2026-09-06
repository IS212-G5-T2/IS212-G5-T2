output "log_bucket_id" {
  description = "Central Cloud Logging bucket resource ID."
  value       = google_logging_project_bucket_config.central.id
}

output "log_sink_writer_identity" {
  description = "Writer identity used by the central project log sink."
  value       = google_logging_project_sink.central.writer_identity
}

output "kms_key_name" {
  description = "CMEK key resource ID for the logging bucket, or null when CMEK is disabled."
  value       = try(google_kms_crypto_key.logging[0].id, null)
}

output "monitoring_notification_channel_ids" {
  description = "Monitoring notification channel IDs created for alert delivery."
  value       = local.notification_channel_ids
}

output "storage_access_log_bucket_name" {
  description = "Cloud Storage bucket name used for object access logs."
  value       = google_storage_bucket.access_logs.name
}
