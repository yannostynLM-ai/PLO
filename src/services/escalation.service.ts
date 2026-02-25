import { prisma } from "../lib/prisma.js";
import { sendEmail } from "./email.service.js";
import { config } from "../config.js";

// =============================================================================
// Service Escalade — Sprint 6
// Détecte les notifications non acquittées après N heures et escalade vers
// manager + ops avec un email dédié.
// =============================================================================

/**
 * Vérifie les notifications non escaladées envoyées depuis plus de
 * ESCALATION_HOURS heures dont l'event n'est pas acquitté,
 * et envoie un email d'escalade à manager + ops.
 */
export async function runEscalationCheck(): Promise<void> {
  const threshold = new Date(Date.now() - config.ESCALATION_HOURS * 3_600_000);

  const candidates = await prisma.notification.findMany({
    where: {
      status: "sent",
      escalated_at: null,
      sent_at: { lt: threshold },
      OR: [
        { event_id: null },                       // règle cron sans event associé
        { event: { acknowledged_by: null } },     // event non acquitté
      ],
    },
    include: {
      rule: { select: { name: true, severity: true } },
      project: { select: { id: true, customer_id: true } },
      event: { select: { acknowledged_by: true } },
    },
  });

  if (candidates.length === 0) {
    return;
  }

  const escalationTargets = [config.ALERT_EMAILS.manager, config.ALERT_EMAILS.ops];
  const now = new Date();

  for (const notif of candidates) {
    const ruleName = notif.rule?.name ?? "Anomalie inconnue";
    const customerId = notif.project?.customer_id ?? notif.project_id;
    const sentAt = notif.sent_at ? notif.sent_at.toISOString() : "inconnu";
    const hoursElapsed = notif.sent_at
      ? Math.round((Date.now() - notif.sent_at.getTime()) / 3_600_000)
      : config.ESCALATION_HOURS;

    const subject = `[ESCALADE PLO] ${ruleName} non traitée — ${customerId}`;

    const bodyText = [
      `ESCALADE AUTOMATIQUE PLO`,
      ``,
      `Une anomalie n'a pas été acquittée dans le délai imparti (${config.ESCALATION_HOURS}h).`,
      ``,
      `Détails :`,
      `  Règle       : ${ruleName}`,
      `  Projet      : ${customerId}`,
      `  Notification: ${notif.id}`,
      `  Envoyée le  : ${sentAt}`,
      `  Délai écoulé: ${hoursElapsed}h`,
      ``,
      `Action requise : acquitter l'anomalie dans l'interface PLO.`,
    ].join("\n");

    const bodyHtml = `
      <div style="font-family:sans-serif;max-width:600px">
        <div style="background:#dc2626;color:white;padding:12px 16px;border-radius:6px 6px 0 0">
          <strong>⚠️ ESCALADE PLO — Anomalie non traitée</strong>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:16px;border-radius:0 0 6px 6px">
          <p>Une anomalie n'a pas été acquittée dans le délai imparti
             (<strong>${config.ESCALATION_HOURS}h</strong>).</p>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:4px 8px;font-weight:bold;color:#6b7280">Règle</td>
                <td style="padding:4px 8px">${ruleName}</td></tr>
            <tr style="background:#f9fafb">
                <td style="padding:4px 8px;font-weight:bold;color:#6b7280">Projet</td>
                <td style="padding:4px 8px">${customerId}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold;color:#6b7280">Notification</td>
                <td style="padding:4px 8px;font-size:12px;color:#6b7280">${notif.id}</td></tr>
            <tr style="background:#f9fafb">
                <td style="padding:4px 8px;font-weight:bold;color:#6b7280">Envoyée le</td>
                <td style="padding:4px 8px">${sentAt}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:bold;color:#6b7280">Délai écoulé</td>
                <td style="padding:4px 8px;color:#dc2626"><strong>${hoursElapsed}h</strong></td></tr>
          </table>
          <p style="margin-top:16px;padding:12px;background:#fef2f2;border-radius:4px;color:#991b1b">
            <strong>Action requise :</strong> acquitter l'anomalie dans l'interface PLO.
          </p>
        </div>
      </div>
    `;

    await sendEmail({
      to: escalationTargets,
      subject,
      html: bodyHtml,
      text: bodyText,
    });

    await prisma.notification.update({
      where: { id: notif.id },
      data: { escalated_at: now },
    });

    console.log(
      `[Escalade] ⚠️ Notification ${notif.id} escaladée (projet ${customerId}, règle ${ruleName})`
    );
  }

  console.log(`[Escalade] ${candidates.length} notification(s) escaladée(s)`);
}
