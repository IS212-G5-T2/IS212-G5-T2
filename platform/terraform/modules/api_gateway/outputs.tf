output "default_hostname" {
  description = "Default hostname assigned to the API Gateway."
  value       = google_api_gateway_gateway.gateway.default_hostname
}

output "gateway_id" {
  description = "Created API Gateway gateway ID."
  value       = google_api_gateway_gateway.gateway.gateway_id
}
