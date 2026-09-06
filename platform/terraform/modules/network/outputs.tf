output "network_name" {
  description = "VPC network name."
  value       = google_compute_network.main.name
}

output "network_self_link" {
  description = "VPC network self link."
  value       = google_compute_network.main.self_link
}

output "subnet_self_link" {
  description = "Private subnet self link."
  value       = google_compute_subnetwork.private.self_link
}

output "pods_secondary_range_name" {
  description = "GKE pods secondary range name."
  value       = local.pods_range
}

output "services_secondary_range_name" {
  description = "GKE services secondary range name."
  value       = local.services_range
}

output "private_services_connection_id" {
  description = "Private Service Access connection ID."
  value       = google_service_networking_connection.private_services.id
}
