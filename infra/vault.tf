# =============================================================================
# PLO — Vault Data Sources (LMES conventions)
# All sensitive configuration is retrieved from Vault, never hardcoded.
# =============================================================================

# ── Product secrets — cross-environment ──────────────────────────────────────
# Path: secret/<component_name>/stack/common
# Contains: JWT_SECRET, API_KEY_*, ADMIN_EMAIL, ADMIN_PASSWORD,
#           ANTHROPIC_API_KEY, ESCALATION_HOURS

data "vault_generic_secret" "common-stack-secret" {
  path = "secret/${var.component_name}/stack/common"
}

# ── Product secrets — per-environment ────────────────────────────────────────
# Path: secret/<component_name>/stack/<env>
# Contains: gcp_project, gcp_region, DATABASE_URL, REDIS_URL, db_password

data "vault_generic_secret" "env-stack-secret" {
  path = "secret/${var.component_name}/stack/${local.envvault}"
}

# ── Shared DevOps secrets — cross-environment ────────────────────────────────
# Path: secret/common-devops/common
# Contains: TURBINE_TOKEN, DBAPI_TOKEN, etc.

data "vault_kv_secret_v2" "common_devops_common_secret" {
  provider = vault.automation
  mount    = "secret"
  name     = "common-devops/common"
}

# ── Shared DevOps secrets — per-environment ──────────────────────────────────
# Path: secret/common-devops/<env>

data "vault_kv_secret_v2" "common_devops_env_secret" {
  provider = vault.automation
  mount    = "secret"
  name     = "common-devops/${local.envvaultdevops}"
}

# ── CIDR list (for network policies if needed) ───────────────────────────────

data "vault_generic_secret" "cidr_list" {
  provider = vault.automation
  path     = "secret/common-devops/common-ip"
}
