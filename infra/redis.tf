# =============================================================================
# PLO — Memorystore Redis 7
# =============================================================================

resource "google_redis_instance" "plo" {
  name               = "${var.component_name}-redis-${var.env}"
  project            = local.gcp_project
  region             = local.gcp_region
  tier               = "BASIC"
  memory_size_gb     = 1
  redis_version      = "REDIS_7_0"
  authorized_network = "projects/${local.gcp_project}/global/networks/default"

  labels = {
    component   = var.component_name
    environment = var.env
    managed_by  = "terraform"
  }
}
