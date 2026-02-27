# =============================================================================
# PLO — Service Account (reference snippet — uncomment and adapt)
# =============================================================================
#
# ── With Workload Identity (recommended for GKE/Turbine) ─────────────────────
#
# module "sa_plo" {
#   source = "git@github.com:adeo/lmes-tfmodules-adeo-service-account.git?ref=2.0.0"
#
#   project_name     = local.gcp_project
#   sa_name          = "${var.component_name}-sa"
#   sa_display_name  = "PLO service account"
#   gke_project_name = local.gcp_project
#   k8s_namespace    = var.component_name
#
#   sa_roles = [
#     "roles/cloudsql.client",      # Connect to Cloud SQL
#     "roles/redis.editor",         # Connect to Memorystore
#     "roles/artifactregistry.reader",  # Pull Docker images
#   ]
# }
#
# ── Without Workload Identity ────────────────────────────────────────────────
#
# module "sa_plo_non_wi" {
#   source = "git@github.com:adeo/lmes-tfmodules-adeo-service-account.git//non-wi?ref=2.0.0"
#
#   project_name    = local.gcp_project
#   sa_name         = "${var.component_name}-sa"
#   sa_display_name = "PLO service account (non-WI)"
#
#   sa_roles = [
#     "roles/cloudsql.client",
#     "roles/redis.editor",
#   ]
# }
