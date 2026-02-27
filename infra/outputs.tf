# =============================================================================
# PLO — Terraform Outputs
# =============================================================================

output "turbine_endpoint" {
  description = "Turbine component endpoint URL"
  value       = turbine_component.plo.endpoint
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

output "environment" {
  description = "Current deployment environment"
  value       = var.env
}

output "gcp_project" {
  description = "GCP project (from Vault)"
  value       = local.gcp_project
}
