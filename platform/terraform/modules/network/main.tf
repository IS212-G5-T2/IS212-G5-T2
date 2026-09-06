locals {
  subnet_name    = "${var.network_name}-${var.environment}-subnet"
  router_name    = "${var.network_name}-${var.environment}-router"
  nat_name       = "${var.network_name}-${var.environment}-nat"
  pods_range     = "${var.environment}-pods"
  services_range = "${var.environment}-services"
}

resource "google_compute_network" "main" {
  project                 = var.project_id
  name                    = var.network_name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "private" {
  project                  = var.project_id
  name                     = local.subnet_name
  region                   = var.region
  network                  = google_compute_network.main.id
  ip_cidr_range            = var.subnet_cidr
  private_ip_google_access = true

  log_config {
    aggregation_interval = var.vpc_flow_logs_aggregation_interval
    flow_sampling        = var.vpc_flow_logs_sampling
    metadata             = "INCLUDE_ALL_METADATA"
  }

  secondary_ip_range {
    range_name    = local.pods_range
    ip_cidr_range = var.pods_cidr
  }

  secondary_ip_range {
    range_name    = local.services_range
    ip_cidr_range = var.services_cidr
  }
}

resource "google_compute_router" "nat" {
  project = var.project_id
  name    = local.router_name
  region  = var.region
  network = google_compute_network.main.id
}

resource "google_compute_router_nat" "egress" {
  project                            = var.project_id
  name                               = local.nat_name
  router                             = google_compute_router.nat.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"

  subnetwork {
    name                    = google_compute_subnetwork.private.id
    source_ip_ranges_to_nat = ["PRIMARY_IP_RANGE", "LIST_OF_SECONDARY_IP_RANGES"]
    secondary_ip_range_names = [
      local.pods_range,
      local.services_range
    ]
  }

  log_config {
    enable = true
    filter = var.nat_log_filter
  }
}

resource "google_compute_global_address" "private_services" {
  project       = var.project_id
  name          = var.private_services_ip_name
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}
