output "microservices_service_account_email" {
  description = "Primary microservices Google service account email."
  value       = try(google_service_account.microservices["microservices"].email, values(google_service_account.microservices)[0].email)
}

output "microservices_service_account_member" {
  description = "Primary microservices Google service account IAM member string."
  value       = try(google_service_account.microservices["microservices"].member, values(google_service_account.microservices)[0].member)
}

output "microservices_service_account_emails" {
  description = "Microservice Google service account emails keyed by identity name."
  value = {
    for name, service_account in google_service_account.microservices : name => service_account.email
  }
}

output "microservices_service_account_members" {
  description = "Microservice Google service account IAM member strings keyed by identity name."
  value = {
    for name, service_account in google_service_account.microservices : name => service_account.member
  }
}

output "api_gateway_service_account_email" {
  description = "API Gateway Google service account email."
  value       = google_service_account.api_gateway.email
}

output "gke_node_service_account_email" {
  description = "GKE node Google service account email."
  value       = google_service_account.gke_nodes.email
}
