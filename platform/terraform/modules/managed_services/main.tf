# kics-scan disable=02474449-71aa-40a1-87ae-e14497747b00

locals {
  storage_object_admin_identities = {
    for name, identity in var.microservice_identities : name => identity
    if identity.storage_object_admin
  }

  pubsub_publish_bindings = {
    for binding in flatten([
      for service_name, identity in var.microservice_identities : [
        for topic in identity.pubsub_publish_topics : {
          key          = "${service_name}:${topic}"
          service_name = service_name
          topic        = topic
        }
      ]
    ]) : binding.key => binding
    if contains(var.pubsub_topics, binding.topic)
  }

  pubsub_subscribe_bindings = {
    for binding in flatten([
      for service_name, identity in var.microservice_identities : [
        for subscription in identity.pubsub_subscribe_subscriptions : {
          key          = "${service_name}:${subscription}"
          service_name = service_name
          subscription = subscription
        }
      ]
    ]) : binding.key => binding
    if contains(keys(var.pubsub_subscriptions), binding.subscription)
  }
}

resource "google_sql_database_instance" "main" {
  project          = var.project_id
  name             = var.cloud_sql_instance_name
  region           = var.region
  database_version = var.cloud_sql_database_version

  settings {
    tier              = var.cloud_sql_tier
    availability_type = "ZONAL"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.private_network_self_link
      ssl_mode        = var.cloud_sql_ssl_mode
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
    }

    user_labels = {
      environment = var.environment
    }
  }

  deletion_protection = var.cloud_sql_deletion_protection
}

resource "google_sql_database" "app" {
  project  = var.project_id
  name     = var.cloud_sql_database_name
  instance = google_sql_database_instance.main.name
}

resource "google_storage_bucket" "objects" {
  project                     = var.project_id
  name                        = var.storage_bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }

  labels = {
    environment = var.environment
  }

  logging {
    log_bucket        = var.storage_access_log_bucket_name
    log_object_prefix = "storage-access-logs/"
  }
}

resource "google_pubsub_topic" "topics" {
  for_each = var.pubsub_topics

  project = var.project_id
  name    = each.value

  labels = {
    environment = var.environment
  }
}

resource "google_pubsub_subscription" "subscriptions" {
  for_each = var.pubsub_subscriptions

  project = var.project_id
  name    = each.key
  topic   = google_pubsub_topic.topics[each.value.topic].name

  ack_deadline_seconds = 30

  expiration_policy {
    ttl = ""
  }

  labels = {
    environment = var.environment
  }
}

resource "google_storage_bucket_iam_member" "microservices_object_admin" {
  for_each = local.storage_object_admin_identities

  bucket = google_storage_bucket.objects.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.microservices_sa_emails[each.key]}"
}

resource "google_pubsub_topic_iam_member" "microservices_publish" {
  for_each = local.pubsub_publish_bindings

  project = var.project_id
  topic   = google_pubsub_topic.topics[each.value.topic].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${var.microservices_sa_emails[each.value.service_name]}"
}

resource "google_pubsub_subscription_iam_member" "microservices_subscribe" {
  for_each = local.pubsub_subscribe_bindings

  project      = var.project_id
  subscription = google_pubsub_subscription.subscriptions[each.value.subscription].name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${var.microservices_sa_emails[each.value.service_name]}"
}
