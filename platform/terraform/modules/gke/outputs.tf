output "cluster_name" {
  description = "GKE cluster name."
  value       = google_container_cluster.private.name
}

output "cluster_endpoint" {
  description = "GKE cluster endpoint."
  value       = google_container_cluster.private.endpoint
  sensitive   = true
}

output "workload_identity_pool" {
  description = "Workload Identity pool configured on the cluster."
  value       = google_container_cluster.private.workload_identity_config[0].workload_pool
}

output "gateway_api_channel" {
  description = "Gateway API channel configured on the cluster."
  value       = google_container_cluster.private.gateway_api_config[0].channel
}

output "node_pool_name" {
  description = "Primary GKE node pool name."
  value       = google_container_node_pool.primary.name
}
