locals {
  api_gateway_account_id = "spm-${var.environment}-api-gateway"
  gke_node_account_id    = "spm-${var.environment}-gke-nodes"
}

resource "google_service_account" "microservices" {
  for_each = var.microservice_identities

  project      = var.project_id
  account_id   = substr("spm-${var.environment}-${replace(each.key, "_", "-")}", 0, 30)
  display_name = "SPM ${var.environment} ${each.key} workload"
}

resource "google_service_account" "api_gateway" {
  project      = var.project_id
  account_id   = local.api_gateway_account_id
  display_name = "SPM ${var.environment} API Gateway"
}

resource "google_service_account" "gke_nodes" {
  project      = var.project_id
  account_id   = local.gke_node_account_id
  display_name = "SPM ${var.environment} GKE nodes"
}

resource "google_service_account_iam_member" "workload_identity_user" {
  for_each = var.microservice_identities

  service_account_id = google_service_account.microservices[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${each.value.kubernetes_namespace}/${each.value.kubernetes_service_account_name}]"
}

resource "google_project_iam_member" "gke_node_registry_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = google_service_account.gke_nodes.member
}

resource "google_project_iam_member" "gke_node_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = google_service_account.gke_nodes.member
}

resource "google_project_iam_member" "gke_node_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = google_service_account.gke_nodes.member
}

resource "google_project_iam_member" "gke_node_monitoring_viewer" {
  project = var.project_id
  role    = "roles/monitoring.viewer"
  member  = google_service_account.gke_nodes.member
}

resource "google_project_iam_member" "microservices_cloud_sql_client" {
  for_each = {
    for name, identity in var.microservice_identities : name => identity
    if identity.cloud_sql_client
  }

  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = google_service_account.microservices[each.key].member
}
