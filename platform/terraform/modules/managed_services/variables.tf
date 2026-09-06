variable "project_id" {
  description = "Google Cloud project ID where managed services are created."
  type        = string
}

variable "region" {
  description = "Google Cloud region for managed services."
  type        = string
}

variable "environment" {
  description = "Environment label applied to managed service resources."
  type        = string
}

variable "private_network_self_link" {
  description = "Self link of the VPC network used for private managed service connectivity."
  type        = string
}

variable "cloud_sql_instance_name" {
  description = "Cloud SQL instance name."
  type        = string
}

variable "cloud_sql_database_name" {
  description = "Application database name to create in Cloud SQL."
  type        = string
}

variable "cloud_sql_database_version" {
  description = "Cloud SQL database engine version."
  type        = string
}

variable "cloud_sql_tier" {
  description = "Cloud SQL machine tier."
  type        = string
}

variable "cloud_sql_ssl_mode" {
  description = "Cloud SQL SSL mode used for client connection enforcement."
  type        = string
}

variable "cloud_sql_deletion_protection" {
  description = "Whether Cloud SQL deletion protection is enabled."
  type        = bool
}

variable "storage_bucket_name" {
  description = "Cloud Storage bucket name for application objects."
  type        = string
}

variable "storage_access_log_bucket_name" {
  description = "Cloud Storage bucket name that receives object bucket access logs."
  type        = string
}

variable "pubsub_topics" {
  description = "Pub/Sub topic names to create."
  type        = set(string)
}

variable "pubsub_subscriptions" {
  description = "Pub/Sub subscriptions to create, keyed by subscription name."
  type = map(object({
    topic = string
  }))
}

variable "microservice_identities" {
  description = "Microservice identity definitions used to grant managed service IAM permissions."
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

variable "microservices_sa_emails" {
  description = "Google service account emails for microservices, keyed by identity name."
  type        = map(string)
}
