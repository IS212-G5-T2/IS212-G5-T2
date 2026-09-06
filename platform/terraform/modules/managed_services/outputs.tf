output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name."
  value       = google_sql_database_instance.main.connection_name
}

output "database_name" {
  description = "Created Cloud SQL database name."
  value       = google_sql_database.app.name
}

output "storage_bucket_name" {
  description = "Application Cloud Storage bucket name."
  value       = google_storage_bucket.objects.name
}

output "pubsub_topics" {
  description = "Created Pub/Sub topic names."
  value       = keys(google_pubsub_topic.topics)
}
