variable "project_id" {
  description = "Google Cloud project ID where network resources are created."
  type        = string
}

variable "region" {
  description = "Google Cloud region for regional network resources."
  type        = string
}

variable "environment" {
  description = "Environment label used when naming secondary IP ranges and labeling resources."
  type        = string
}

variable "network_name" {
  description = "VPC network name."
  type        = string
}

variable "subnet_cidr" {
  description = "Primary CIDR range for the private subnet."
  type        = string
}

variable "pods_cidr" {
  description = "Secondary CIDR range for GKE pods."
  type        = string
}

variable "services_cidr" {
  description = "Secondary CIDR range for GKE services."
  type        = string
}

variable "private_services_ip_name" {
  description = "Name of the allocated address range for Private Service Access."
  type        = string
}

variable "vpc_flow_logs_aggregation_interval" {
  description = "Aggregation interval for VPC Flow Logs on the private subnet."
  type        = string
}

variable "vpc_flow_logs_sampling" {
  description = "VPC Flow Logs sampling rate from 0.0 to 1.0."
  type        = number
}

variable "nat_log_filter" {
  description = "Cloud NAT logging filter."
  type        = string
}
