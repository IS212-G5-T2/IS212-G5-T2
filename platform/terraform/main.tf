locals {
  required_services = toset([
    "apigateway.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudkms.googleapis.com",
    "compute.googleapis.com",
    "container.googleapis.com",
    "logging.googleapis.com",
    "iam.googleapis.com",
    "identitytoolkit.googleapis.com",
    "monitoring.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com",
    "billingbudgets.googleapis.com"
  ])

  default_microservice_identities = {
    microservices = {
      kubernetes_namespace            = var.gke_namespace
      kubernetes_service_account_name = var.kubernetes_service_account_name
      secrets                         = var.secrets
      cloud_sql_client                = true
      storage_object_admin            = true
      pubsub_publish_topics           = var.pubsub_topics
      pubsub_subscribe_subscriptions  = toset(keys(var.pubsub_subscriptions))
    }
  }

  effective_microservice_identities = length(var.microservice_identities) == 0 ? local.default_microservice_identities : var.microservice_identities

  secret_ids = setunion(
    var.secrets,
    toset(flatten([
      for _, identity in local.effective_microservice_identities : tolist(identity.secrets)
    ]))
  )

  effective_allowed_jwt_issuer    = coalesce(var.allowed_jwt_issuer, "https://securetoken.google.com/${var.project_id}")
  effective_allowed_jwt_jwks_uri  = coalesce(var.allowed_jwt_jwks_uri, "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
  effective_allowed_jwt_audiences = coalesce(var.allowed_jwt_audiences, [var.project_id])
  effective_storage_bucket_name   = coalesce(var.storage_bucket_name, "${var.project_id}-spm-objects-${var.environment}")
}

resource "google_project_service" "required" {
  for_each = local.required_services

  project                    = var.project_id
  service                    = each.value
  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "terraform_data" "budget_alert_inputs" {
  count = var.enable_budget_alerts ? 1 : 0

  input = {
    billing_account_id    = var.billing_account_id
    monthly_budget_amount = var.monthly_budget_amount
  }

  lifecycle {
    precondition {
      condition     = var.billing_account_id != null && var.monthly_budget_amount != null
      error_message = "billing_account_id and monthly_budget_amount are required when enable_budget_alerts is true."
    }
  }
}

module "network" {
  source = "./modules/network"

  project_id                         = var.project_id
  region                             = var.region
  environment                        = var.environment
  network_name                       = var.network_name
  subnet_cidr                        = var.subnet_cidr
  pods_cidr                          = var.pods_cidr
  services_cidr                      = var.services_cidr
  private_services_ip_name           = var.private_services_ip_name
  vpc_flow_logs_aggregation_interval = var.vpc_flow_logs_aggregation_interval
  vpc_flow_logs_sampling             = var.vpc_flow_logs_sampling
  nat_log_filter                     = var.nat_log_filter

  depends_on = [google_project_service.required]
}

module "iam" {
  source = "./modules/iam"

  project_id              = var.project_id
  environment             = var.environment
  microservice_identities = local.effective_microservice_identities

  depends_on = [google_project_service.required]
}

module "identity_platform" {
  source = "./modules/identity_platform"

  project_id                 = var.project_id
  google_provider_enabled    = var.identity_platform_google_provider_enabled
  google_oauth_client_id     = var.identity_platform_google_oauth_client_id
  google_oauth_client_secret = var.identity_platform_google_oauth_client_secret

  depends_on = [google_project_service.required]
}

module "platform_services" {
  source = "./modules/platform_services"

  project_id           = var.project_id
  region               = var.region
  environment          = var.environment
  artifact_repo_id     = var.artifact_repo_id
  artifact_repo_format = var.artifact_repo_format
  secrets              = local.secret_ids
  secret_payloads      = var.secret_payloads
  secret_accessors = {
    for secret in local.secret_ids : secret => toset([
      for service_name, identity in local.effective_microservice_identities :
      module.iam.microservices_service_account_members[service_name]
      if contains(identity.secrets, secret)
    ])
  }

  depends_on = [google_project_service.required]
}

module "gke" {
  source = "./modules/gke"

  project_id                    = var.project_id
  location                      = var.gke_location
  environment                   = var.environment
  cluster_name                  = var.cluster_name
  network_self_link             = module.network.network_self_link
  subnet_self_link              = module.network.subnet_self_link
  pods_secondary_range_name     = module.network.pods_secondary_range_name
  services_secondary_range_name = module.network.services_secondary_range_name
  node_service_account_email    = module.iam.gke_node_service_account_email
  master_ipv4_cidr_block        = var.master_ipv4_cidr_block
  enable_private_endpoint       = var.gke_enable_private_endpoint
  node_machine_type             = var.node_machine_type
  node_count                    = var.node_count
  network_policy_enabled        = var.gke_network_policy_enabled
  gateway_api_channel           = var.gke_gateway_api_channel

  depends_on = [
    google_project_service.required,
    module.network,
    module.iam
  ]
}

module "api_gateway" {
  source = "./modules/api_gateway"
  count  = var.enable_api_gateway && var.backend_url != null ? 1 : 0

  project_id            = var.project_id
  region                = var.region
  environment           = var.environment
  api_id                = var.api_id
  gateway_id            = var.gateway_id
  api_gateway_sa_email  = module.iam.api_gateway_service_account_email
  backend_url           = var.backend_url
  allowed_jwt_audiences = local.effective_allowed_jwt_audiences
  allowed_jwt_issuer    = local.effective_allowed_jwt_issuer
  allowed_jwt_jwks_uri  = local.effective_allowed_jwt_jwks_uri

  depends_on = [
    google_project_service.required,
    module.iam
  ]
}

module "observability" {
  source = "./modules/observability"

  project_id                       = var.project_id
  region                           = var.region
  environment                      = var.environment
  log_bucket_id                    = var.log_bucket_id
  log_bucket_retention_days        = var.log_bucket_retention_days
  enable_log_bucket_cmek           = var.enable_log_bucket_cmek
  log_exclusion_filters            = var.log_exclusion_filters
  monitoring_alert_email_addresses = var.monitoring_alert_email_addresses
  enable_budget_alerts             = var.enable_budget_alerts
  billing_account_id               = var.billing_account_id
  monthly_budget_amount            = var.monthly_budget_amount
  budget_currency_code             = var.budget_currency_code

  depends_on = [google_project_service.required]
}

module "managed_services" {
  source = "./modules/managed_services"

  project_id                     = var.project_id
  region                         = var.region
  environment                    = var.environment
  private_network_self_link      = module.network.network_self_link
  cloud_sql_instance_name        = var.cloud_sql_instance_name
  cloud_sql_database_name        = var.cloud_sql_database_name
  cloud_sql_database_version     = var.cloud_sql_database_version
  cloud_sql_tier                 = var.cloud_sql_tier
  cloud_sql_ssl_mode             = var.cloud_sql_ssl_mode
  cloud_sql_deletion_protection  = var.cloud_sql_deletion_protection
  storage_bucket_name            = local.effective_storage_bucket_name
  storage_access_log_bucket_name = module.observability.storage_access_log_bucket_name
  pubsub_topics                  = var.pubsub_topics
  pubsub_subscriptions           = var.pubsub_subscriptions
  microservice_identities        = local.effective_microservice_identities
  microservices_sa_emails        = module.iam.microservices_service_account_emails

  depends_on = [
    google_project_service.required,
    module.network,
    module.observability
  ]
}
