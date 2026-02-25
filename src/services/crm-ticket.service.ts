import { prisma } from "../lib/prisma.js";

// =============================================================================
// Service Ticket CRM — simulation de création de tickets CRM
// Sprint 6 : pour les règles critiques, génère une référence ticket CRM simulée
// =============================================================================

/**
 * Crée un ticket CRM simulé pour une notification liée à une règle critique.
 * Met à jour `notification.crm_ticket_ref` et logge la création.
 */
export async function createCrmTicketForNotification(
  notificationId: string,
  projectId: string,
  ruleId: string,
  subject: string
): Promise<string> {
  const ticketRef = `CRM-${Date.now()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

  await prisma.notification.update({
    where: { id: notificationId },
    data: { crm_ticket_ref: ticketRef },
  });

  console.log(
    `[CRM] 🎫 Ticket ${ticketRef} créé — projet ${projectId} | règle ${ruleId} | "${subject}"`
  );

  return ticketRef;
}
