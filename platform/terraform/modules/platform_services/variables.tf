variable "project_id" {
  description = "Google Cloud project ID where platform services are created."
  type        = string
}

variable "region" {
  description = "Google Cloud region for regional platform services."
  type        = string
}

variable "environment" {
  description = "Environment label applied to platform service resources."
  type        = string
}

variable "artifact_repo_id" {
  description = "Artifact Registry repository ID for service images."
  type        = string
}

variable "artifact_repo_format" {
  description = "Artifact Registry repository format, such as DOCKER."
  type        = string
}

variable "secrets" {
  description = "Secret Manager secret IDs to create."
  type        = set(string)
}

variable "secret_payloads" {
  description = "Optional initial secret payloads keyed by secret ID."
  type        = map(string)
  sensitive   = true
}

variable "secret_accessors" {
  description = "IAM members allowed to access each secret, keyed by secret ID."
  type        = map(set(string))
}
