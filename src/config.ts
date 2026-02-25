// =============================================================================
// PLO — Configuration centralisée (chargée depuis process.env / .env)
// =============================================================================

import type { EventSource } from "@prisma/client";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// Construction dynamique du mapping API key → source
// Les sources Sprint 2 sont obligatoires ; les sources Sprint 5 sont optionnelles.
function buildApiKeys(): Record<string, EventSource> {
  const keys: Record<string, EventSource> = {
    [required("API_KEY_ERP")]: "erp",
    [required("API_KEY_OMS")]: "oms",
    [required("API_KEY_TMS_LASTMILE")]: "tms_lastmile",
    [required("API_KEY_MANUAL")]: "manual",
  };

  // Sprint 5 — optionnels : ne pas démarrer si absent
  const optionalSources: Array<[string, EventSource]> = [
    ["API_KEY_WFM", "wfm"],
    ["API_KEY_CRM", "crm"],
    ["API_KEY_ECOMMERCE", "ecommerce"],
  ];
  for (const [envKey, source] of optionalSources) {
    const val = process.env[envKey];
    if (val) keys[val] = source;
  }

  return keys;
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
  API_KEYS: buildApiKeys(),

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

  // Sprint 6 — Escalade temporelle
  ESCALATION_HOURS: parseInt(optional("ESCALATION_HOURS", "4"), 10),
};

export type SourceFromKey = EventSource;
