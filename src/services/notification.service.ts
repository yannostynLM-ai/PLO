import { prisma } from "../lib/prisma.js";
import { sendEmail } from "./email.service.js";
import type { RuleResult } from "../anomaly/types.js";

// =============================================================================
// Service Notification — persistance + déduplication + envoi email
// =============================================================================

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 heures

/**
 * Vérifie si une notification a déjà été envoyée pour cette règle+projet dans les 24h.
 */
export async function hasRecentNotification(
  ruleId: string,
  projectId: string
): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);
  const existing = await prisma.notification.findFirst({
    where: {
      rule_id: ruleId,
      project_id: projectId,
      status: "sent",
      created_at: { gte: since },
    },
  });
  return existing !== null;
}

/**
 * Traite un résultat de règle :
 *  1. Déduplication (24h par règle+projet)
 *  2. Crée les enregistrements Notification en base
 *  3. Envoie les emails
 *  4. Met à jour le statut de l'étape en "anomaly" si applicable
 */
export async function handleRuleResult(result: RuleResult): Promise<void> {
  // Déduplication
  const alreadySent = await hasRecentNotification(result.ruleId, result.projectId);
  if (alreadySent) {
    return;
  }

  const now = new Date();

  // Crée une Notification par destinataire
  await Promise.all(
    result.recipients.map(async (recipient) => {
      const notification = await prisma.notification.create({
        data: {
          project_id: result.projectId,
          order_id: result.orderId,
          installation_id: result.installationId,
          event_id: result.eventId,
          rule_id: result.ruleId,
          channel: "email",
          recipient: recipient.email,
          status: "pending",
        },
      });

      // Envoie l'email
      const sent = await sendEmail({
        to: recipient.email,
        subject: result.subject,
        html: result.bodyHtml,
        text: result.bodyText,
      });

      // Met à jour le statut
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: sent ? "sent" : "failed",
          sent_at: sent ? now : undefined,
          updated_at: now,
        },
      });
    })
  );

  // Marque le step de l'event en anomaly (non bloquant)
  try {
    const ev = await prisma.event.findUnique({
      where: { id: result.eventId },
      select: { step_id: true },
    });
    if (ev?.step_id) {
      await prisma.step.update({
        where: { id: ev.step_id },
        data: { status: "anomaly", updated_at: now },
      });
    }
  } catch {
    // Non bloquant si le step n'existe pas encore
  }
}

/**
 * Version allégée pour les règles cron : pas d'event_id associé.
 */
export async function handleScheduledRuleResult(
  result: Omit<RuleResult, "eventId"> & { eventId?: string }
): Promise<void> {
  const alreadySent = await hasRecentNotification(result.ruleId, result.projectId);
  if (alreadySent) {
    return;
  }

  const now = new Date();

  await Promise.all(
    result.recipients.map(async (recipient) => {
      const notification = await prisma.notification.create({
        data: {
          project_id: result.projectId,
          order_id: result.orderId,
          installation_id: result.installationId ?? null,
          event_id: result.eventId ?? null,
          rule_id: result.ruleId,
          channel: "email",
          recipient: recipient.email,
          status: "pending",
        },
      });

      const sent = await sendEmail({
        to: recipient.email,
        subject: result.subject,
        html: result.bodyHtml,
        text: result.bodyText,
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: sent ? "sent" : "failed",
          sent_at: sent ? now : undefined,
          updated_at: now,
        },
      });
    })
  );
}
