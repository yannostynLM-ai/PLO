# =============================================================================
# PLO — Providers (LMES conventions)
# =============================================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "4.2.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "6.19.0"
    }
    turbine = {
      source  = "adeo.github/delivery/turbine"
      version = "1.23.0"
    }
    # ── Uncomment to enable DBAPI PostgreSQL provisioning ──────────────
    # dbapi = {
    #   source  = "adeo.github/delivery/dbapi"
    #   version = "4.7.10"
    # }
    # postgresql = {
    #   source  = "cyrilgdn/postgresql"
    #   version = "1.22.0"
    # }
  }

  # Backend — GCS bucket (set by CloudCraft or manually)
  backend "gcs" {}
}

# ── Vault — default (product namespace) ──────────────────────────────────────

provider "vault" {
  # Authenticates via VAULT_ADDR + VAULT_TOKEN env vars (CI/CD or local)
}

# ── Vault — automation (shared DevOps namespace) ─────────────────────────────

provider "vault" {
  alias     = "automation"
  namespace = "eslm/gtdp/devops"
}

# ── Google Cloud ─────────────────────────────────────────────────────────────

provider "google" {
  project = local.gcp_project
  region  = local.gcp_region
}

# ── Turbine (K8s deployment) ─────────────────────────────────────────────────

provider "turbine" {
  token = nonsensitive(data.vault_kv_secret_v2.common_devops_common_secret.data["TURBINE_TOKEN"])
}

# ── DBAPI (uncomment to enable) ──────────────────────────────────────────────
# provider "dbapi" {
#   token = nonsensitive(data.vault_kv_secret_v2.common_devops_common_secret.data["DBAPI_TOKEN"])
# }

# ── PostgreSQL DDL (uncomment to enable) ──────────────────────────────────────
# provider "postgresql" {
#   host     = <from dbapi output>
#   port     = 5432
#   username = <from dbapi output>
#   password = <from dbapi output>
#   sslmode  = "require"
# }
