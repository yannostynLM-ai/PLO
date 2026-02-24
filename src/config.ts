// =============================================================================
// PLO — Configuration centralisée (chargée depuis process.env / .env)
// =============================================================================

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // Database
  DATABASE_URL: required("DATABASE_URL"),

  // Redis
  REDIS_URL: optional("REDIS_URL", "redis://localhost:6379"),

  // HTTP Server
  PORT: parseInt(optional("PORT", "3000"), 10),
  HOST: optional("HOST", "0.0.0.0"),

  // API Keys par source — utilisées pour l'authentification Bearer
  API_KEYS: {
    [required("API_KEY_ERP")]: "erp" as const,
    [required("API_KEY_OMS")]: "oms" as const,
    [required("API_KEY_TMS_LASTMILE")]: "tms_lastmile" as const,
    [required("API_KEY_MANUAL")]: "manual" as const,
  },

  // SMTP — Notifications email (vide = mode console)
  SMTP_HOST: optional("SMTP_HOST", ""),
  SMTP_PORT: parseInt(optional("SMTP_PORT", "587"), 10),
  SMTP_USER: optional("SMTP_USER", ""),
  SMTP_PASS: optional("SMTP_PASS", ""),
  SMTP_FROM: optional("SMTP_FROM", "plo-alerts@example.fr"),

  // Destinataires des alertes par rôle
  ALERT_EMAILS: {
    coordinateur: optional("ALERT_EMAIL_COORDINATEUR", "coordinateur@example.fr"),
    acheteur: optional("ALERT_EMAIL_ACHETEUR", "acheteur@example.fr"),
    entrepot: optional("ALERT_EMAIL_ENTREPOT", "entrepot@example.fr"),
    manager: optional("ALERT_EMAIL_MANAGER", "manager@example.fr"),
    ops: optional("ALERT_EMAIL_OPS", "ops@example.fr"),
  },
} as const;

export type SourceFromKey = (typeof config.API_KEYS)[keyof typeof config.API_KEYS];
