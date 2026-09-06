output "project_id" {
  description = "Google Cloud project ID."
  value       = var.project_id
}

output "region" {
  description = "Primary Google Cloud region."
  value       = var.region
}

output "gke_location" {
  description = "GKE cluster and node pool location."
  value       = var.gke_location
}

output "network_name" {
  description = "Created VPC network name."
  value       = module.network.network_name
}

output "gke_cluster_name" {
  description = "Created GKE cluster name."
  value       = module.gke.cluster_name
}

output "gateway_api_channel" {
  description = "GKE Gateway API channel configured on the cluster."
  value       = module.gke.gateway_api_channel
}

output "artifact_registry_repository" {
  description = "Artifact Registry repository name."
  value       = module.platform_services.artifact_repository_name
}

output "api_gateway_default_hostname" {
  description = "Default hostname exposed by API Gateway."
  value       = try(module.api_gateway[0].default_hostname, null)
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL connection name."
  value       = module.managed_services.cloud_sql_connection_name
}

output "storage_bucket_name" {
  description = "Cloud Storage bucket name used by application workloads."
  value       = module.managed_services.storage_bucket_name
}

output "microservices_service_account_email" {
  description = "Google service account email used by private microservices through Workload Identity."
  value       = module.iam.microservices_service_account_email
}

output "microservices_service_account_emails" {
  description = "Google service account emails keyed by microservice identity name."
  value       = module.iam.microservices_service_account_emails
}

output "identity_platform_config_name" {
  description = "Identity Platform project config resource name."
  value       = module.identity_platform.config_name
}

output "identity_platform_google_provider_name" {
  description = "Google sign-in provider resource name when Terraform manages it."
  value       = module.identity_platform.google_provider_name
}

output "log_bucket_id" {
  description = "Centralized Cloud Logging bucket ID."
  value       = module.observability.log_bucket_id
}

output "log_sink_writer_identity" {
  description = "Writer identity used by the centralized log sink."
  value       = module.observability.log_sink_writer_identity
}

output "kms_key_name" {
  description = "Cloud KMS key used for centralized logging when CMEK is enabled."
  value       = module.observability.kms_key_name
}

output "monitoring_notification_channel_ids" {
  description = "Cloud Monitoring notification channel IDs created for alerting."
  value       = module.observability.monitoring_notification_channel_ids
}
