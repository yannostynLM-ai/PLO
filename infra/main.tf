# =============================================================================
# PLO — GCP Infrastructure (Cloud Run + Cloud SQL + Memorystore)
# =============================================================================

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ── Enable required GCP APIs ─────────────────────────────────────────────────

locals {
  services = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "vpcaccess.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "servicenetworking.googleapis.com",
    "compute.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

# ── VPC Network ──────────────────────────────────────────────────────────────

resource "google_compute_network" "plo" {
  name                    = "plo-vpc"
  auto_create_subnetworks = true

  depends_on = [google_project_service.apis]
}

# Private IP range for Cloud SQL and Memorystore
resource "google_compute_global_address" "private_ip_range" {
  name          = "plo-private-ip-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.plo.id
}

# VPC peering for managed services (Cloud SQL, Memorystore)
resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.plo.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# Serverless VPC connector (Cloud Run → private services)
resource "google_vpc_access_connector" "plo" {
  name          = "plo-connector"
  region        = var.region
  network       = google_compute_network.plo.name
  ip_cidr_range = "10.8.0.0/28"
  machine_type  = "e2-micro"
  min_instances = 2
  max_instances = 3

  depends_on = [google_project_service.apis]
}

# ── Cloud SQL (PostgreSQL 15) ────────────────────────────────────────────────

resource "google_sql_database_instance" "plo" {
  name             = "plo-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 10
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.plo.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = false
      start_time                     = "03:00"
    }
  }

  deletion_protection = false # demo — set to true in production

  depends_on = [google_service_networking_connection.private_vpc]
}

resource "google_sql_database" "plo" {
  name     = "plo_db"
  instance = google_sql_database_instance.plo.name
}

resource "google_sql_user" "plo" {
  name     = "plo"
  instance = google_sql_database_instance.plo.name
  password = var.db_password
}

# ── Memorystore (Redis 7) ───────────────────────────────────────────────────

resource "google_redis_instance" "plo" {
  name               = "plo-redis"
  tier               = "BASIC"
  memory_size_gb     = 1
  region             = var.region
  redis_version      = "REDIS_7_0"
  authorized_network = google_compute_network.plo.id

  depends_on = [google_project_service.apis]
}

# ── Artifact Registry ────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "plo" {
  location      = var.region
  repository_id = "plo"
  format        = "DOCKER"
  description   = "PLO Docker images"

  depends_on = [google_project_service.apis]
}

# ── Secret Manager ───────────────────────────────────────────────────────────

locals {
  secrets = {
    "plo-db-password"    = var.db_password
    "plo-jwt-secret"     = var.jwt_secret
    "plo-admin-password" = var.admin_password
    "plo-api-key-erp"    = var.api_key_erp
    "plo-api-key-oms"    = var.api_key_oms
    "plo-api-key-tms"    = var.api_key_tms
    "plo-api-key-manual" = var.api_key_manual
    "plo-anthropic-key"  = var.anthropic_api_key
  }
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = local.secrets
  secret_id = each.key

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "secrets" {
  for_each    = local.secrets
  secret      = google_secret_manager_secret.secrets[each.key].id
  secret_data = each.value
}

# Grant Cloud Run service account access to secrets
data "google_project" "current" {}

resource "google_secret_manager_secret_iam_member" "cloud_run_access" {
  for_each  = local.secrets
  secret_id = google_secret_manager_secret.secrets[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

# ── Cloud Run Service ────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "plo" {
  name     = "plo"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    vpc_access {
      connector = google_vpc_access_connector.plo.id
      egress    = "ALL_TRAFFIC"
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/plo/plo:latest"

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      # ── Plain environment variables ──────────────────────────────────
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "HOST"
        value = "0.0.0.0"
      }
      env {
        name  = "ESCALATION_HOURS"
        value = "4"
      }
      env {
        name  = "ADMIN_EMAIL"
        value = var.admin_email
      }
      env {
        name  = "DATABASE_URL"
        value = "postgresql://plo:${var.db_password}@${google_sql_database_instance.plo.private_ip_address}:5432/plo_db?schema=public"
      }
      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.plo.host}:${google_redis_instance.plo.port}"
      }

      # ── Secret environment variables ─────────────────────────────────
      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["plo-jwt-secret"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "ADMIN_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["plo-admin-password"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "API_KEY_ERP"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["plo-api-key-erp"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "API_KEY_OMS"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["plo-api-key-oms"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "API_KEY_TMS_LASTMILE"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["plo-api-key-tms"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "API_KEY_MANUAL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["plo-api-key-manual"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "ANTHROPIC_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["plo-anthropic-key"].secret_id
            version = "latest"
          }
        }
      }

      # ── Startup probe ────────────────────────────────────────────────
      startup_probe {
        http_get {
          path = "/health"
          port = 3000
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
        timeout_seconds       = 3
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.secrets,
    google_artifact_registry_repository.plo,
  ]
}

# ── Public access (demo — remove for production) ─────────────────────────────

resource "google_cloud_run_service_iam_member" "public" {
  location = google_cloud_run_v2_service.plo.location
  service  = google_cloud_run_v2_service.plo.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
