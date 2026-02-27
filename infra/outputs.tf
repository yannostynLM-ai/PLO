# =============================================================================
# PLO — Terraform Outputs
# =============================================================================

output "cloud_run_url" {
  description = "Public URL of the PLO Cloud Run service"
  value       = google_cloud_run_v2_service.plo.uri
}

output "db_connection_name" {
  description = "Cloud SQL connection name (for Cloud SQL Auth Proxy)"
  value       = google_sql_database_instance.plo.connection_name
}

output "db_private_ip" {
  description = "Private IP of the Cloud SQL instance"
  value       = google_sql_database_instance.plo.private_ip_address
  sensitive   = true
}

output "redis_host" {
  description = "Memorystore Redis host"
  value       = google_redis_instance.plo.host
}

output "redis_port" {
  description = "Memorystore Redis port"
  value       = google_redis_instance.plo.port
}

output "artifact_registry" {
  description = "Artifact Registry Docker repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/plo"
}
