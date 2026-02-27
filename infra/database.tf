# =============================================================================
# PLO — Database (PostgreSQL 15)
# =============================================================================
#
# Two options below. DBAPI is the LMES-recommended path.
# The Cloud SQL fallback is provided for quick demo/prototyping.
#
# ── OPTION A: DBAPI-managed PostgreSQL (LMES standard) ───────────────────────
# Requires: uncomment dbapi + postgresql providers in providers.tf
#
# resource "dbapi_projects" "project_main" {
#   provider    = dbapi
#   project_id  = local.gcp_project
#   bu          = "lmes"
#   product_id  = var.component_name
#   environment = lookup(var.dbapi_environment, var.env)
# }
#
# resource "dbapi_providers" "provider_postgresql" {
#   provider   = dbapi
#   project_id = dbapi_projects.project_main.id
#   engine     = "CLOUDSQL_POSTGRESQL"
#   version    = "POSTGRES_15"
#   settings = {
#     tier            = "db-f1-micro"
#     region          = local.gcp_region
#     private_network = true
#   }
# }
#
# resource "dbapi_apikey" "postgresql_apikey" {
#   provider    = dbapi
#   project_id  = dbapi_projects.project_main.id
#   provider_id = dbapi_providers.provider_postgresql.id
#   database    = "plo_db"
#   role        = "owner"
# }
#
# ── OPTION B: Cloud SQL direct (simpler for demo) ────────────────────────────

resource "google_sql_database_instance" "plo" {
  name             = "${var.component_name}-db-${var.env}"
  project          = local.gcp_project
  database_version = "POSTGRES_15"
  region           = local.gcp_region

  settings {
    tier              = "db-f1-micro"
    availability_type = "ZONAL"
    disk_size         = 10
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = "projects/${local.gcp_project}/global/networks/default"
    }

    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }
  }

  deletion_protection = var.env == "prod" ? true : false
}

resource "google_sql_database" "plo" {
  name     = "plo_db"
  project  = local.gcp_project
  instance = google_sql_database_instance.plo.name
}

resource "google_sql_user" "plo" {
  name     = "plo"
  project  = local.gcp_project
  instance = google_sql_database_instance.plo.name
  password = nonsensitive(data.vault_generic_secret.env-stack-secret.data["db_password"])
}
