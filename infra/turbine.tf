# =============================================================================
# PLO — Turbine (K8s deployment on GKE)
# =============================================================================

# ── Environment idling — active by default ───────────────────────────────────
# Manages the lifecycle of non-production environments (auto-shutdown)

resource "turbine_environment_idling" "plo" {
  count = var.env == "prod" ? 0 : 1

  product     = var.component_name
  environment = local.envturbine

  schedule {
    start = "08:00"
    stop  = "20:00"
    days  = ["monday", "tuesday", "wednesday", "thursday", "friday"]
  }
}

# ── Turbine component — PLO application ──────────────────────────────────────

resource "turbine_component" "plo" {
  product     = var.component_name
  name        = "plo-api"
  environment = local.envturbine

  container {
    image = "${local.gcp_region}-docker.pkg.dev/${local.gcp_project}/${var.component_name}/plo:latest"
    port  = 3000

    resources {
      cpu    = "500m"
      memory = "512Mi"
    }

    # ── Environment variables from Vault ───────────────────────────────
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

    # Per-environment secrets (DATABASE_URL, REDIS_URL)
    env {
      name  = "DATABASE_URL"
      value = nonsensitive(data.vault_generic_secret.env-stack-secret.data["DATABASE_URL"])
    }
    env {
      name  = "REDIS_URL"
      value = nonsensitive(data.vault_generic_secret.env-stack-secret.data["REDIS_URL"])
    }

    # Cross-environment secrets
    env {
      name  = "JWT_SECRET"
      value = nonsensitive(data.vault_generic_secret.common-stack-secret.data["JWT_SECRET"])
    }
    env {
      name  = "ADMIN_EMAIL"
      value = nonsensitive(data.vault_generic_secret.common-stack-secret.data["ADMIN_EMAIL"])
    }
    env {
      name  = "ADMIN_PASSWORD"
      value = nonsensitive(data.vault_generic_secret.common-stack-secret.data["ADMIN_PASSWORD"])
    }
    env {
      name  = "ESCALATION_HOURS"
      value = nonsensitive(data.vault_generic_secret.common-stack-secret.data["ESCALATION_HOURS"])
    }

    # API Keys (Bearer tokens per source)
    env {
      name  = "API_KEY_ERP"
      value = nonsensitive(data.vault_generic_secret.common-stack-secret.data["API_KEY_ERP"])
    }
    env {
      name  = "API_KEY_OMS"
      value = nonsensitive(data.vault_generic_secret.common-stack-secret.data["API_KEY_OMS"])
    }
    env {
      name  = "API_KEY_TMS_LASTMILE"
      value = nonsensitive(data.vault_generic_secret.common-stack-secret.data["API_KEY_TMS_LASTMILE"])
    }
    env {
      name  = "API_KEY_MANUAL"
      value = nonsensitive(data.vault_generic_secret.common-stack-secret.data["API_KEY_MANUAL"])
    }

    # AI risk analysis (optional)
    env {
      name  = "ANTHROPIC_API_KEY"
      value = nonsensitive(data.vault_generic_secret.common-stack-secret.data["ANTHROPIC_API_KEY"])
    }

    # ── Health check ───────────────────────────────────────────────────
    liveness_probe {
      http_get {
        path = "/health"
        port = 3000
      }
      initial_delay_seconds = 10
      period_seconds        = 30
    }

    readiness_probe {
      http_get {
        path = "/health"
        port = 3000
      }
      initial_delay_seconds = 5
      period_seconds        = 10
    }
  }

  replicas {
    min = var.env == "prod" ? 2 : 1
    max = var.env == "prod" ? 4 : 2
  }
}

# ── Turbine deploy — triggers deployment ─────────────────────────────────────

resource "turbine_deploy" "plo" {
  product     = var.component_name
  component   = turbine_component.plo.name
  environment = local.envturbine

  depends_on = [turbine_component.plo]
}
