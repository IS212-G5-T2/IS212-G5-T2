# kics-scan disable=9192e0f9-eca5-4056-9282-ae2a736a4088,6ccb85d7-0420-4907-9380-50313f80946b
resource "google_container_cluster" "private" {
  project  = var.project_id
  name     = var.cluster_name
  location = var.location

  network    = var.network_self_link
  subnetwork = var.subnet_self_link

  remove_default_node_pool = true
  initial_node_count       = 1

  networking_mode = "VPC_NATIVE"

  ip_allocation_policy {
    cluster_secondary_range_name  = var.pods_secondary_range_name
    services_secondary_range_name = var.services_secondary_range_name
  }

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = var.enable_private_endpoint
    master_ipv4_cidr_block  = var.master_ipv4_cidr_block
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  gateway_api_config {
    channel = var.gateway_api_channel
  }

  release_channel {
    channel = "REGULAR"
  }

  addons_config {
    horizontal_pod_autoscaling {
      disabled = false
    }

    http_load_balancing {
      disabled = false
    }

    network_policy_config {
      disabled = !var.network_policy_enabled
    }
  }

  network_policy {
    enabled  = var.network_policy_enabled
    provider = "CALICO"
  }

  resource_labels = {
    environment = var.environment
  }
}

resource "google_container_node_pool" "primary" {
  project  = var.project_id
  name     = "${var.cluster_name}-primary"
  location = var.location
  cluster  = google_container_cluster.private.name

  initial_node_count = var.node_count

  autoscaling {
    min_node_count = 1
    max_node_count = max(var.node_count, 3)
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type    = var.node_machine_type
    service_account = var.node_service_account_email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    labels = {
      environment = var.environment
    }
  }
}
