# =============================================================================
# PLO — Terraform Variables
# =============================================================================

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "europe-west1"
}

variable "db_tier" {
  description = "Cloud SQL machine tier (db-f1-micro for demo, db-g1-small for prod)"
  type        = string
  default     = "db-f1-micro"
}

# ── Secrets ──────────────────────────────────────────────────────────────────

variable "db_password" {
  description = "PostgreSQL password for user 'plo'"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret (minimum 32 characters)"
  type        = string
  sensitive   = true
}

variable "admin_email" {
  description = "Admin account email"
  type        = string
  default     = "admin@plo.local"
}

variable "admin_password" {
  description = "Admin account password"
  type        = string
  sensitive   = true
}

# ── API Keys (Bearer tokens per source) ──────────────────────────────────────

variable "api_key_erp" {
  description = "Bearer token for ERP source"
  type        = string
  sensitive   = true
}

variable "api_key_oms" {
  description = "Bearer token for OMS source"
  type        = string
  sensitive   = true
}

variable "api_key_tms" {
  description = "Bearer token for TMS last-mile source"
  type        = string
  sensitive   = true
}

variable "api_key_manual" {
  description = "Bearer token for manual source"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key for AI risk analysis (leave empty for heuristic fallback)"
  type        = string
  default     = ""
  sensitive   = true
}
