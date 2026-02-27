# =============================================================================
# PLO — Variables & Locals (LMES conventions)
# =============================================================================

# ── Core variables ───────────────────────────────────────────────────────────

variable "env" {
  description = "Target environment (dev, uat, sit, prep, prod)"
  type        = string
  default     = "dev"
}

variable "component_name" {
  description = "Component name (used for Vault paths, Turbine, naming)"
  type        = string
  default     = "lmes-plo"
}

# ── Environment mapping tables ───────────────────────────────────────────────

variable "env_vault" {
  description = "Vault path suffix per environment"
  default = {
    "dev"  = "dev"
    "uat"  = "uat"
    "sit"  = "sit"
    "prep" = "prep"
    "prod" = "prod"
  }
}

variable "env_turbine" {
  description = "Turbine environment alias"
  default = {
    "dev"  = "dev"
    "uat"  = "uat1"
    "prep" = "prep"
    "prod" = "prod"
  }
}

variable "env_vault_devops" {
  description = "DevOps Vault path suffix per environment"
  default = {
    "dev"  = "dev"
    "uat"  = "uat1"
    "prep" = "prep"
    "prod" = "prod"
  }
}

variable "dbapi_environment" {
  description = "DBAPI environment code"
  default = {
    "dev"  = "D"
    "uat"  = "R"
    "sit"  = "T"
    "qa"   = "Q"
    "prep" = "A"
    "prod" = "P"
  }
}

# ── Derived locals ───────────────────────────────────────────────────────────

locals {
  envvault       = lookup(var.env_vault, var.env)
  envturbine     = lookup(var.env_turbine, var.env)
  envvaultdevops = lookup(var.env_vault_devops, var.env)

  # GCP project and region — always from Vault, never hardcoded
  gcp_project = nonsensitive(data.vault_generic_secret.env-stack-secret.data["gcp_project"])
  gcp_region  = nonsensitive(data.vault_generic_secret.env-stack-secret.data["gcp_region"])
}
