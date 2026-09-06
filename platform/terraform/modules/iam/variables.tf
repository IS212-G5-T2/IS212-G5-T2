variable "project_id" {
  description = "Google Cloud project ID where IAM resources are created."
  type        = string
}

variable "environment" {
  description = "Environment label applied to IAM resources."
  type        = string
}

variable "microservice_identities" {
  description = "Microservice identity definitions used to create service accounts and Workload Identity bindings."
  type = map(object({
    kubernetes_namespace            = string
    kubernetes_service_account_name = string
    secrets                         = set(string)
    cloud_sql_client                = bool
    storage_object_admin            = bool
    pubsub_publish_topics           = set(string)
    pubsub_subscribe_subscriptions  = set(string)
  }))
}
