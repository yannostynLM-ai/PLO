import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { config } from "../config.js";

// =============================================================================
// Service Email — nodemailer avec fallback console (dev sans SMTP)
// =============================================================================

let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!config.SMTP_HOST) return null;
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER
      ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
      : undefined,
  });

  return _transporter;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

/**
 * Envoie un email via SMTP ou logge en console si SMTP non configuré.
 * Ne lève jamais d'exception — log l'erreur et continue.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  const transporter = getTransporter();

  if (!transporter) {
    // Mode console — pas de SMTP configuré (dev)
    console.log(
      [
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "[EMAIL] Mode console — SMTP non configuré",
        `  De      : ${config.SMTP_FROM}`,
        `  À       : ${recipients.join(", ")}`,
        `  Sujet   : ${params.subject}`,
        "─────────────────────────────────────────────────",
        params.text,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
      ].join("\n")
    );
    return true;
  }

  try {
    await transporter.sendMail({
      from: config.SMTP_FROM,
      to: recipients.join(", "),
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    return true;
  } catch (err) {
    console.error("[EmailService] Échec envoi email:", {
      to: recipients,
      subject: params.subject,
      error: err instanceof Error ? err.message : err,
    });
    return false;
  }
}
