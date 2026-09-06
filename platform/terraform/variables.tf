variable "project_id" {
  description = "Google Cloud project ID."
  type        = string
}

variable "region" {
  description = "Primary Google Cloud region."
  type        = string
  default     = "asia-southeast1"
}

variable "gke_location" {
  description = "GKE cluster and node pool location. Use a zone for lower-cost dev, or a region for production high availability."
  type        = string
  default     = "asia-southeast1-a"
}

variable "environment" {
  description = "Environment name used in resource naming and labels."
  type        = string
  default     = "dev"
}

variable "network_name" {
  description = "VPC network name."
  type        = string
  default     = "spm-network"
}

variable "subnet_cidr" {
  description = "Primary subnet CIDR for private workloads."
  type        = string
  default     = "10.10.0.0/20"
}

variable "pods_cidr" {
  description = "Secondary range CIDR for GKE pods."
  type        = string
  default     = "10.20.0.0/16"
}

variable "services_cidr" {
  description = "Secondary range CIDR for GKE services."
  type        = string
  default     = "10.30.0.0/20"
}

variable "private_services_ip_name" {
  description = "Name of the allocated private service access address range."
  type        = string
  default     = "spm-private-services"
}

variable "vpc_flow_logs_aggregation_interval" {
  description = "Aggregation interval for VPC Flow Logs."
  type        = string
  default     = "INTERVAL_10_MIN"

  validation {
    condition     = contains(["INTERVAL_5_SEC", "INTERVAL_30_SEC", "INTERVAL_1_MIN", "INTERVAL_5_MIN", "INTERVAL_10_MIN", "INTERVAL_15_MIN"], var.vpc_flow_logs_aggregation_interval)
    error_message = "vpc_flow_logs_aggregation_interval must be a valid Google Compute subnet log aggregation interval."
  }
}

variable "vpc_flow_logs_sampling" {
  description = "VPC Flow Logs sampling rate from 0.0 to 1.0."
  type        = number
  default     = 0

  validation {
    condition     = var.vpc_flow_logs_sampling >= 0 && var.vpc_flow_logs_sampling <= 1
    error_message = "vpc_flow_logs_sampling must be between 0 and 1."
  }
}

variable "nat_log_filter" {
  description = "Cloud NAT logging filter."
  type        = string
  default     = "ERRORS_ONLY"

  validation {
    condition     = contains(["ERRORS_ONLY", "TRANSLATIONS_ONLY", "ALL"], var.nat_log_filter)
    error_message = "nat_log_filter must be one of ERRORS_ONLY, TRANSLATIONS_ONLY, or ALL."
  }
}

variable "gke_namespace" {
  description = "Kubernetes namespace used by private microservices."
  type        = string
  default     = "spm"
}

variable "kubernetes_service_account_name" {
  description = "Kubernetes service account mapped to the microservices Google service account through Workload Identity."
  type        = string
  default     = "spm-microservices"
}

variable "microservice_identities" {
  description = "Optional per-microservice workload identity and resource access configuration. Leave empty to create one shared microservices identity for the current baseline."
  type = map(object({
    kubernetes_namespace            = optional(string, "spm")
    kubernetes_service_account_name = string
    secrets                         = optional(set(string), [])
    cloud_sql_client                = optional(bool, true)
    storage_object_admin            = optional(bool, true)
    pubsub_publish_topics           = optional(set(string), [])
    pubsub_subscribe_subscriptions  = optional(set(string), [])
  }))
  default = {}
}

variable "artifact_repo_id" {
  description = "Artifact Registry repository ID for private microservice images."
  type        = string
  default     = "spm-services"
}

variable "artifact_repo_format" {
  description = "Artifact Registry repository format."
  type        = string
  default     = "DOCKER"
}

variable "secrets" {
  description = "Secret Manager secret IDs to create."
  type        = set(string)
  default     = ["database-url", "service-config"]
}

variable "secret_payloads" {
  description = "Optional initial secret payloads keyed by secret ID. Leave empty to create metadata only."
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "cluster_name" {
  description = "GKE private cluster name."
  type        = string
  default     = "spm-private-cluster"
}

variable "master_ipv4_cidr_block" {
  description = "CIDR block for the private GKE control plane."
  type        = string
  default     = "172.16.0.0/28"
}

variable "gke_enable_private_endpoint" {
  description = "Whether the GKE control plane should only expose a private endpoint. Keep false for dev or CI unless runners can reach the VPC."
  type        = bool
  default     = false
}

variable "node_machine_type" {
  description = "GKE node pool machine type."
  type        = string
  default     = "e2-small"
}

variable "node_count" {
  description = "Initial node count for the primary GKE node pool."
  type        = number
  default     = 1
}

variable "gke_network_policy_enabled" {
  description = "Whether to enable Kubernetes NetworkPolicy enforcement on the GKE cluster."
  type        = bool
  default     = true
}

variable "gke_gateway_api_channel" {
  description = "GKE Gateway API channel. Use CHANNEL_STANDARD for the newer GKE-managed Gateway API load-balancing model."
  type        = string
  default     = "CHANNEL_STANDARD"

  validation {
    condition     = contains(["CHANNEL_DISABLED", "CHANNEL_EXPERIMENTAL", "CHANNEL_STANDARD"], var.gke_gateway_api_channel)
    error_message = "gke_gateway_api_channel must be CHANNEL_DISABLED, CHANNEL_EXPERIMENTAL, or CHANNEL_STANDARD."
  }
}

variable "api_id" {
  description = "API Gateway API ID."
  type        = string
  default     = "spm-api"
}

variable "gateway_id" {
  description = "API Gateway gateway ID."
  type        = string
  default     = "spm-gateway"
}

variable "enable_api_gateway" {
  description = "Whether to create API Gateway resources. Keep false until a real backend_url exists."
  type        = bool
  default     = false
}

variable "backend_url" {
  description = "HTTPS backend URL for API Gateway to route to, such as the endpoint provisioned by GKE Gateway API. Required only when enable_api_gateway is true."
  type        = string
  default     = null
  nullable    = true
}

variable "allowed_jwt_issuer" {
  description = "Optional JWT issuer override accepted by API Gateway. Defaults to the Identity Platform issuer for project_id."
  type        = string
  default     = null
  nullable    = true
}

variable "allowed_jwt_jwks_uri" {
  description = "Optional JWKS URI override used by API Gateway to validate JWT signatures. Defaults to Google's securetoken JWKS URI."
  type        = string
  default     = null
  nullable    = true
}

variable "allowed_jwt_audiences" {
  description = "Optional JWT audiences accepted by API Gateway. Defaults to project_id for Identity Platform ID tokens."
  type        = list(string)
  default     = null
  nullable    = true
}

variable "identity_platform_google_provider_enabled" {
  description = "Whether Terraform should configure Google sign-in in Identity Platform."
  type        = bool
  default     = false
}

variable "identity_platform_google_oauth_client_id" {
  description = "OAuth client ID for the Google Identity Platform google.com provider. Required when identity_platform_google_provider_enabled is true."
  type        = string
  default     = null
  nullable    = true
}

variable "identity_platform_google_oauth_client_secret" {
  description = "OAuth client secret for the Google Identity Platform google.com provider. Supply from a protected source; do not commit it."
  type        = string
  default     = null
  nullable    = true
  sensitive   = true
}

variable "cloud_sql_instance_name" {
  description = "Cloud SQL instance name."
  type        = string
  default     = "spm-db"
}

variable "cloud_sql_database_name" {
  description = "Application database name."
  type        = string
  default     = "spm"
}

variable "cloud_sql_database_version" {
  description = "Cloud SQL database version."
  type        = string
  default     = "POSTGRES_16"
}

variable "cloud_sql_tier" {
  description = "Cloud SQL machine tier."
  type        = string
  default     = "db-f1-micro"
}

variable "cloud_sql_ssl_mode" {
  description = "Cloud SQL SSL/TLS enforcement mode."
  type        = string
  default     = "ENCRYPTED_ONLY"

  validation {
    condition     = contains(["ALLOW_UNENCRYPTED_AND_ENCRYPTED", "ENCRYPTED_ONLY", "TRUSTED_CLIENT_CERTIFICATE_REQUIRED"], var.cloud_sql_ssl_mode)
    error_message = "cloud_sql_ssl_mode must be ALLOW_UNENCRYPTED_AND_ENCRYPTED, ENCRYPTED_ONLY, or TRUSTED_CLIENT_CERTIFICATE_REQUIRED."
  }
}

variable "cloud_sql_deletion_protection" {
  description = "Whether Cloud SQL deletion protection is enabled."
  type        = bool
  default     = true
}

variable "storage_bucket_name" {
  description = "Optional globally unique Cloud Storage bucket name for application objects. Defaults to <project_id>-spm-objects-<environment>."
  type        = string
  default     = null
  nullable    = true
}

variable "pubsub_topics" {
  description = "Pub/Sub topics used for events."
  type        = set(string)
  default     = ["spm-events"]
}

variable "pubsub_subscriptions" {
  description = "Pub/Sub subscriptions keyed by subscription name."
  type = map(object({
    topic = string
  }))
  default = {
    spm-events-microservices = {
      topic = "spm-events"
    }
  }
}

variable "log_bucket_id" {
  description = "Cloud Logging bucket ID for centralized logs."
  type        = string
  default     = "spm-central-logs"
}

variable "log_bucket_retention_days" {
  description = "Retention period for the centralized Cloud Logging bucket and storage access-log bucket."
  type        = number
  default     = 7

  validation {
    condition     = var.log_bucket_retention_days >= 1
    error_message = "log_bucket_retention_days must be at least 1."
  }
}

variable "enable_log_bucket_cmek" {
  description = "Whether to encrypt the centralized Cloud Logging bucket with a customer-managed Cloud KMS key."
  type        = bool
  default     = false
}

variable "log_exclusion_filters" {
  description = "Project-level Cloud Logging exclusion filters keyed by exclusion name."
  type        = map(string)
  default = {
    spm-exclude-successful-readiness-probes = "resource.type=\"k8s_container\" AND httpRequest.requestUrl=~\"/healthz|/readyz\" AND severity<ERROR"
  }
}

variable "monitoring_alert_email_addresses" {
  description = "Email addresses to create as Cloud Monitoring notification channels."
  type        = set(string)
  default     = []
}

variable "enable_budget_alerts" {
  description = "Whether to create a project-scoped billing budget alert. Requires billing_account_id and monthly_budget_amount."
  type        = bool
  default     = false
}

variable "billing_account_id" {
  description = "Billing account ID used when enable_budget_alerts is true."
  type        = string
  default     = null
  nullable    = true
}

variable "monthly_budget_amount" {
  description = "Whole-unit monthly budget amount used when enable_budget_alerts is true."
  type        = number
  default     = null
  nullable    = true
}

variable "budget_currency_code" {
  description = "Currency code for budget alerts."
  type        = string
  default     = "SGD"
}
