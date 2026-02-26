import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma.js";
import { sendEmail } from "./email.service.js";
import { createCrmTicketForNotification } from "./crm-ticket.service.js";
import { broadcastNotification } from "./sse.service.js";
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
  const createdNotifIds: string[] = [];

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
      createdNotifIds.push(notification.id);

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

  // Sprint 6 — Ticket CRM pour les règles critiques + Sprint 11 broadcast SSE
  if (createdNotifIds.length > 0) {
    const rule = await prisma.anomalyRule.findUnique({
      where: { id: result.ruleId },
      select: { severity: true, name: true },
    });
    if (rule?.severity === "critical") {
      await createCrmTicketForNotification(
        createdNotifIds[0],
        result.projectId,
        result.ruleId,
        result.subject
      );
    }
    if (rule) {
      const project = await prisma.project.findUnique({
        where: { id: result.projectId },
        select: { customer_id: true, project_type: true },
      });
      if (project) {
        broadcastNotification({
          id: createdNotifIds[0],
          project_id: result.projectId,
          rule_name: rule.name,
          severity: rule.severity,
          project_customer_id: project.customer_id,
          project_type: project.project_type as string,
          sent_at: now.toISOString(),
        });
      }
    }
  }

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

  // Sprint 11 — Broadcast SSE pour les règles planifiées
  if (result.recipients.length > 0) {
    const [ruleData, projectData] = await Promise.all([
      prisma.anomalyRule.findUnique({
        where: { id: result.ruleId },
        select: { name: true, severity: true },
      }),
      prisma.project.findUnique({
        where: { id: result.projectId },
        select: { customer_id: true, project_type: true },
      }),
    ]);
    if (ruleData && projectData) {
      broadcastNotification({
        id: randomUUID(),
        project_id: result.projectId,
        rule_name: ruleData.name,
        severity: ruleData.severity,
        project_customer_id: projectData.customer_id,
        project_type: projectData.project_type as string,
        sent_at: now.toISOString(),
      });
    }
  }
}
