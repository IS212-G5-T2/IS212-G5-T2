variable "project_id" {
  description = "Google Cloud project ID where GKE resources are created."
  type        = string
}

variable "location" {
  description = "GKE cluster and node pool location. Use a zone for lower-cost dev or a region for higher availability."
  type        = string
}

variable "environment" {
  description = "Environment label applied to GKE resources."
  type        = string
}

variable "cluster_name" {
  description = "GKE cluster name."
  type        = string
}

variable "network_self_link" {
  description = "Self link of the VPC network used by the cluster."
  type        = string
}

variable "subnet_self_link" {
  description = "Self link of the subnet used by the cluster."
  type        = string
}

variable "pods_secondary_range_name" {
  description = "Secondary range name used for GKE pod IPs."
  type        = string
}

variable "services_secondary_range_name" {
  description = "Secondary range name used for GKE service IPs."
  type        = string
}

variable "node_service_account_email" {
  description = "Service account email used by GKE nodes."
  type        = string
}

variable "master_ipv4_cidr_block" {
  description = "CIDR block used for the private GKE control plane."
  type        = string
}

variable "enable_private_endpoint" {
  description = "Whether to expose only the private GKE control plane endpoint."
  type        = bool
}

variable "node_machine_type" {
  description = "Machine type for GKE nodes."
  type        = string
}

variable "node_count" {
  description = "Minimum and initial node count for the primary node pool."
  type        = number
}

variable "network_policy_enabled" {
  description = "Whether to enable Kubernetes network policy."
  type        = bool
}

variable "gateway_api_channel" {
  description = "GKE Gateway API release channel."
  type        = string
}
