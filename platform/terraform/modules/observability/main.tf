data "google_project" "current" {
  project_id = var.project_id
}

locals {
  labels = {
    environment = var.environment
  }

  kms_enabled                    = var.enable_log_bucket_cmek
  storage_access_log_bucket_name = "${var.project_id}-spm-access-logs-${var.environment}"
  logging_service_account        = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-logging.iam.gserviceaccount.com"
  notification_channel_ids       = [for channel in google_monitoring_notification_channel.email : channel.id]
  budget_enabled                 = var.enable_budget_alerts && var.billing_account_id != null && var.monthly_budget_amount != null
}

resource "google_kms_key_ring" "logging" {
  count = local.kms_enabled ? 1 : 0

  project  = var.project_id
  name     = "spm-${var.environment}-logging"
  location = var.region
}

resource "google_kms_crypto_key" "logging" {
  count = local.kms_enabled ? 1 : 0

  name            = "spm-${var.environment}-log-bucket"
  key_ring        = google_kms_key_ring.logging[0].id
  rotation_period = "7776000s"
}

resource "google_kms_crypto_key_iam_member" "logging_service_account" {
  count = local.kms_enabled ? 1 : 0

  crypto_key_id = google_kms_crypto_key.logging[0].id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = local.logging_service_account
}

resource "google_logging_project_bucket_config" "central" {
  project        = var.project_id
  location       = "global"
  bucket_id      = var.log_bucket_id
  description    = "Centralized low-retention logs for SPM ${var.environment}."
  retention_days = var.log_bucket_retention_days

  dynamic "cmek_settings" {
    for_each = local.kms_enabled ? [1] : []

    content {
      kms_key_name = google_kms_crypto_key.logging[0].id
    }
  }

  depends_on = [google_kms_crypto_key_iam_member.logging_service_account]
}

resource "google_logging_project_sink" "central" {
  project                = var.project_id
  name                   = "spm-${var.environment}-central-logs"
  destination            = "logging.googleapis.com/${google_logging_project_bucket_config.central.id}"
  unique_writer_identity = true

  filter = <<-EOT
    log_id("cloudaudit.googleapis.com/activity")
    OR log_id("cloudaudit.googleapis.com/system_event")
    OR log_id("cloudaudit.googleapis.com/policy")
    OR resource.type="k8s_container"
    OR resource.type="k8s_cluster"
    OR resource.type="api_gateway"
    OR resource.type="cloudsql_database"
    OR resource.type="pubsub_topic"
    OR resource.type="pubsub_subscription"
    OR resource.type="gcs_bucket"
    OR resource.type="nat_gateway"
    OR resource.type="gce_subnetwork"
    OR resource.type="http_load_balancer"
  EOT
}

resource "google_project_iam_member" "sink_writer" {
  project = var.project_id
  role    = "roles/logging.bucketWriter"
  member  = google_logging_project_sink.central.writer_identity
}

resource "google_logging_project_exclusion" "cost_controls" {
  for_each = var.log_exclusion_filters

  project     = var.project_id
  name        = each.key
  description = "Cost-control exclusion for SPM ${var.environment} centralized logging."
  filter      = each.value
}

# kics-scan ignore-line
resource "google_storage_bucket" "access_logs" {
  project                     = var.project_id
  name                        = local.storage_access_log_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      age = var.log_bucket_retention_days
    }
  }

  labels = local.labels
}

resource "google_storage_bucket_iam_member" "storage_analytics_writer" {
  bucket = google_storage_bucket.access_logs.name
  role   = "roles/storage.objectCreator"
  member = "group:cloud-storage-analytics@google.com"
}

resource "google_monitoring_notification_channel" "email" {
  for_each = var.monitoring_alert_email_addresses

  project      = var.project_id
  display_name = "SPM ${var.environment} alerts ${each.value}"
  type         = "email"

  labels = {
    email_address = each.value
  }
}

resource "google_monitoring_alert_policy" "cloud_sql_disk" {
  project               = var.project_id
  display_name          = "SPM ${var.environment} Cloud SQL disk utilization"
  combiner              = "OR"
  notification_channels = local.notification_channel_ids

  conditions {
    display_name = "Cloud SQL disk utilization above 85 percent"

    condition_threshold {
      filter          = "metric.type=\"cloudsql.googleapis.com/database/disk/utilization\" AND resource.type=\"cloudsql_database\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.85

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  user_labels = local.labels
}

resource "google_monitoring_alert_policy" "gke_container_restarts" {
  project               = var.project_id
  display_name          = "SPM ${var.environment} GKE container restarts"
  combiner              = "OR"
  notification_channels = local.notification_channel_ids

  conditions {
    display_name = "Container restart rate is elevated"

    condition_threshold {
      filter          = "metric.type=\"kubernetes.io/container/restart_count\" AND resource.type=\"k8s_container\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 3

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  user_labels = local.labels
}

resource "google_monitoring_alert_policy" "api_gateway_errors" {
  project               = var.project_id
  display_name          = "SPM ${var.environment} API Gateway 5xx responses"
  combiner              = "OR"
  notification_channels = local.notification_channel_ids

  conditions {
    display_name = "API Gateway 5xx response count is elevated"

    condition_threshold {
      filter          = "metric.type=\"apigateway.googleapis.com/api/request_count\" AND resource.type=\"api\" AND metric.label.\"response_code_class\"=\"5xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 10

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  user_labels = local.labels
}

resource "google_monitoring_alert_policy" "pubsub_backlog" {
  project               = var.project_id
  display_name          = "SPM ${var.environment} Pub/Sub backlog"
  combiner              = "OR"
  notification_channels = local.notification_channel_ids

  conditions {
    display_name = "Undelivered Pub/Sub messages above threshold"

    condition_threshold {
      filter          = "metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\" AND resource.type=\"pubsub_subscription\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 1000

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  user_labels = local.labels
}

resource "google_billing_budget" "monthly" {
  count = local.budget_enabled ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "SPM ${var.environment} monthly budget"

  budget_filter {
    projects = ["projects/${data.google_project.current.number}"]
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency_code
      units         = tostring(floor(var.monthly_budget_amount))
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.9
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    monitoring_notification_channels = local.notification_channel_ids
    disable_default_iam_recipients   = length(local.notification_channel_ids) > 0
  }
}
