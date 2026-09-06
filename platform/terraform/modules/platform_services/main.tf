resource "google_artifact_registry_repository" "services" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_repo_id
  description   = "Private container images for SPM ${var.environment} microservices."
  format        = var.artifact_repo_format
}

resource "google_secret_manager_secret" "secrets" {
  for_each = var.secrets

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
  }
}

resource "google_secret_manager_secret_version" "payloads" {
  for_each = toset(nonsensitive(keys(var.secret_payloads)))

  secret      = google_secret_manager_secret.secrets[each.value].id
  secret_data = var.secret_payloads[each.value]
}

resource "google_secret_manager_secret_iam_member" "accessors" {
  for_each = {
    for pair in flatten([
      for secret, members in var.secret_accessors : [
        for member in members : {
          secret = secret
          member = member
        }
      ]
    ]) :
    "${pair.secret}:${pair.member}" => {
      secret = pair.secret
      member = pair.member
    }
  }

  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value.secret].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}
