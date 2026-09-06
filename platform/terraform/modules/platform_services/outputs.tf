output "artifact_repository_name" {
  description = "Full Artifact Registry repository resource name."
  value       = google_artifact_registry_repository.services.name
}

output "secret_ids" {
  description = "Secret Manager secret resource IDs keyed by secret name."
  value = {
    for name, secret in google_secret_manager_secret.secrets : name => secret.id
  }
}
