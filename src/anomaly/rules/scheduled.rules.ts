import { prisma } from "../../lib/prisma.js";
import { config } from "../../config.js";
import { RULE_IDS } from "../rule-ids.js";
import type { ScheduledRule, RuleResult, Recipient } from "../types.js";

// =============================================================================
// Règles d'anomalie périodiques — évaluées par cron (horaire / quotidien)
// =============================================================================

const emails = config.ALERT_EMAILS;

function r(role: keyof typeof emails): Recipient {
  return { email: emails[role], role };
}

function genericEmail(
  anoId: string,
  anoName: string,
  customerId: string,
  projectId: string,
  details: string[]
): { subject: string; html: string; text: string } {
  const subject = `[PLO] ⚠️ ${anoName} (${customerId})`;
  const detailRows = details.map((d) => `<li>${d}</li>`).join("");
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #d97706; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
    <strong>⚠️ ALERTE — ${anoId} : ${anoName}</strong>
  </div>
  <div style="border: 1px solid #d97706; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    <p><strong>Dossier :</strong> ${customerId}</p>
    <ul>${detailRows}</ul>
    <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">PLO — Projet : ${projectId}</p>
  </div>
</body>
</html>`.trim();
  const text = [
    `=== ALERTE — ${anoId} : ${anoName} ===`,
    `Dossier : ${customerId}`,
    ...details.map((d) => `  - ${d}`),
    `Projet PLO : ${projectId}`,
  ].join("\n");
  return { subject, html, text };
}

// =============================================================================
// ANO-07 — Pas de last mile planifié J-5 avant l'installation (quotidien)
// =============================================================================
export const ano07: ScheduledRule = {
  ruleId: RULE_IDS.ANO_07,
  name: "Livraison non planifiée avant installation",
  frequency: "daily",
  async evaluate(): Promise<RuleResult[]> {
    const in5days = new Date(Date.now() + 5 * 86_400_000);
    const in6days = new Date(Date.now() + 6 * 86_400_000);

    // Installations prévues dans 5-6 jours sans last mile scheduled/delivered
    const installations = await prisma.installation.findMany({
      where: {
        scheduled_date: { gte: in5days, lte: in6days },
        status: "scheduled",
        project: {
          last_mile: {
            status: { notIn: ["scheduled", "in_transit", "delivered", "partial_delivered"] },
          },
        },
      },
      include: {
        project: { select: { id: true, customer_id: true, last_mile: true } },
      },
    });

    return installations.map((inst) => {
      const scheduledStr = inst.scheduled_date!.toLocaleDateString("fr-FR");
      const { subject, html, text } = genericEmail(
        "ANO-07",
        "Livraison non planifiée — installation dans 5 jours",
        inst.project.customer_id,
        inst.project.id,
        [
          `Date d'installation : ${scheduledStr}`,
          `Statut last mile : ${inst.project.last_mile?.status ?? "non créé"}`,
          "La livraison n'est pas encore planifiée",
          "Contacter le TMS pour planifier la livraison en urgence",
        ]
      );
      return {
        ruleId: RULE_IDS.ANO_07,
        projectId: inst.project.id,
        orderId: null,
        installationId: inst.id,
        eventId: undefined as unknown as string,
        recipients: [r("coordinateur")],
        subject,
        bodyHtml: html,
        bodyText: text,
      };
    });
  },
};

// =============================================================================
// ANO-08 — Picking non démarré H-8 avant la livraison (horaire)
// =============================================================================
export const ano08: ScheduledRule = {
  ruleId: RULE_IDS.ANO_08,
  name: "Picking non démarré avant livraison imminente",
  frequency: "hourly",
  async evaluate(): Promise<RuleResult[]> {
    const in8h = new Date(Date.now() + 8 * 3_600_000);

    // Commandes avec livraison dans moins de 8h dont le picking n'est pas démarré
    const orders = await prisma.order.findMany({
      where: {
        promised_delivery_date: { lte: in8h, gte: new Date() },
        status: { in: ["confirmed", "in_fulfillment"] },
        // Pas d'event picking.started
        events: { none: { event_type: "picking.started" } },
      },
      include: {
        project: { select: { id: true, customer_id: true } },
      },
    });

    return orders.map((order) => {
      const deliveryStr = order.promised_delivery_date!.toLocaleDateString("fr-FR");
      const hoursLeft = Math.round(
        (order.promised_delivery_date!.getTime() - Date.now()) / 3_600_000
      );
      const { subject, html, text } = genericEmail(
        "ANO-08",
        "Picking non démarré avant livraison imminente",
        order.project.customer_id,
        order.project.id,
        [
          `Commande : ${order.erp_order_ref ?? order.id}`,
          `Livraison dans : ${hoursLeft}h (${deliveryStr})`,
          "Aucun événement picking.started reçu",
          "Contacter l'entrepôt pour démarrer la préparation en urgence",
        ]
      );
      return {
        ruleId: RULE_IDS.ANO_08,
        projectId: order.project.id,
        orderId: order.id,
        installationId: null,
        eventId: undefined as unknown as string,
        recipients: [r("entrepot")],
        subject,
        bodyHtml: html,
        bodyText: text,
      };
    });
  },
};

// =============================================================================
// ANO-09 — Pas de clôture livraison H+4 après fin du créneau (horaire)
// =============================================================================
export const ano09: ScheduledRule = {
  ruleId: RULE_IDS.ANO_09,
  name: "Pas de clôture livraison après le créneau",
  frequency: "hourly",
  async evaluate(): Promise<RuleResult[]> {
    const now = new Date();
    const limit4hAgo = new Date(Date.now() - 4 * 3_600_000);

    // Last miles scheduled dont la date prévue est passée de >4h sans delivered/failed
    const lastMiles = await prisma.lastMileDelivery.findMany({
      where: {
        status: { in: ["scheduled", "in_transit"] },
        scheduled_date: { lte: limit4hAgo },
      },
      include: {
        project: { select: { id: true, customer_id: true } },
      },
    });

    // Filtrer ceux qui n'ont pas reçu d'event de clôture
    const results: RuleResult[] = [];
    for (const lm of lastMiles) {
      const closureEvent = await prisma.event.findFirst({
        where: {
          project_id: lm.project_id,
          event_type: { in: ["lastmile.delivered", "lastmile.failed", "lastmile.partial_delivered"] },
        },
      });
      if (closureEvent) continue;

      const scheduledStr = lm.scheduled_date!.toLocaleDateString("fr-FR");
      const hoursAgo = Math.round((now.getTime() - lm.scheduled_date!.getTime()) / 3_600_000);
      const { subject, html, text } = genericEmail(
        "ANO-09",
        "Livraison sans clôture H+4",
        lm.project.customer_id,
        lm.project.id,
        [
          `Créneau prévu : ${scheduledStr}`,
          `Dépassement : ${hoursAgo}h sans retour`,
          "Aucun événement de clôture (delivered/failed) reçu du TMS",
          "Contacter le transporteur pour obtenir un statut",
          "Vérifier si le client a été livré",
        ]
      );
      results.push({
        ruleId: RULE_IDS.ANO_09,
        projectId: lm.project_id,
        orderId: null,
        installationId: null,
        eventId: undefined as unknown as string,
        recipients: [r("ops")],
        subject,
        bodyHtml: html,
        bodyText: text,
      });
    }
    return results;
  },
};

// =============================================================================
// ANO-10 — Devis pose non créé H+48 après acceptation devis produits (quotidien)
// =============================================================================
export const ano10: ScheduledRule = {
  ruleId: RULE_IDS.ANO_10,
  name: "Devis pose non créé après acceptation produits",
  frequency: "daily",
  async evaluate(): Promise<RuleResult[]> {
    const limit48hAgo = new Date(Date.now() - 48 * 3_600_000);

    // Projets avec quote_products.accepted il y a >48h sans quote_installation.created
    const projects = await prisma.project.findMany({
      where: {
        status: "active",
        events: {
          some: { event_type: "quote_products.accepted", created_at: { lte: limit48hAgo } },
          none: { event_type: "quote_installation.created" },
        },
      },
      select: { id: true, customer_id: true },
    });

    return projects.map((project) => {
      const { subject, html, text } = genericEmail(
        "ANO-10",
        "Devis pose non créé 48h après acceptation devis produits",
        project.customer_id,
        project.id,
        [
          "Le devis produits a été accepté il y a plus de 48h",
          "Aucun devis d'installation n'a été créé",
          "Contacter l'équipe commerciale pour déclencher le devis pose",
          "Vérifier si une installation est requise pour ce projet",
        ]
      );
      return {
        ruleId: RULE_IDS.ANO_10,
        projectId: project.id,
        orderId: null,
        installationId: null,
        eventId: undefined as unknown as string,
        recipients: [r("coordinateur")],
        subject,
        bodyHtml: html,
        bodyText: text,
      };
    });
  },
};

// =============================================================================
// ANO-13 — Technicien en retard de plus de 2h (horaire)
// =============================================================================
export const ano13: ScheduledRule = {
  ruleId: RULE_IDS.ANO_13,
  name: "Technicien en retard — installation non démarrée",
  frequency: "hourly",
  async evaluate(): Promise<RuleResult[]> {
    const limit2hAgo = new Date(Date.now() - 2 * 3_600_000);

    // Installations scheduled dont la date est passée de >2h sans installation.started
    const installations = await prisma.installation.findMany({
      where: {
        status: "scheduled",
        scheduled_date: { lte: limit2hAgo },
        started_at: null,
        // Pas d'event installation.started
        project: {
          events: { none: { event_type: "installation.started" } },
        },
      },
      include: {
        project: { select: { id: true, customer_id: true } },
      },
    });

    return installations.map((inst) => {
      const scheduledStr = inst.scheduled_date!.toLocaleDateString("fr-FR");
      const hoursLate = Math.round(
        (Date.now() - inst.scheduled_date!.getTime()) / 3_600_000
      );
      const { subject, html, text } = genericEmail(
        "ANO-13",
        "Technicien en retard — intervention non démarrée",
        inst.project.customer_id,
        inst.project.id,
        [
          `Date intervention prévue : ${scheduledStr}`,
          `Retard : ${hoursLate}h`,
          inst.technician_name ? `Technicien : ${inst.technician_name}` : "Technicien non renseigné",
          "Contacter le technicien pour obtenir un statut",
          "Informer le client du retard si nécessaire",
        ].filter(Boolean) as string[]
      );
      return {
        ruleId: RULE_IDS.ANO_13,
        projectId: inst.project.id,
        orderId: null,
        installationId: inst.id,
        eventId: undefined as unknown as string,
        recipients: [r("coordinateur")],
        subject,
        bodyHtml: html,
        bodyText: text,
      };
    });
  },
};

// =============================================================================
// ANO-14 — Compte-rendu non soumis H+4 après installation terminée (horaire)
// =============================================================================
export const ano14: ScheduledRule = {
  ruleId: RULE_IDS.ANO_14,
  name: "Compte-rendu installation non soumis",
  frequency: "hourly",
  async evaluate(): Promise<RuleResult[]> {
    const limit4hAgo = new Date(Date.now() - 4 * 3_600_000);

    // Installations complétées il y a >4h sans report_submitted
    const installations = await prisma.installation.findMany({
      where: {
        status: "completed",
        completed_at: { lte: limit4hAgo },
        // report: null — Json? field, filter via events instead
        project: {
          events: { none: { event_type: "installation.report_submitted" } },
        },
      },
      select: {
        id: true,
        completed_at: true,
        technician_name: true,
        project_id: true,
        project: { select: { id: true, customer_id: true } },
      },
    });

    return installations.map((inst) => {
      const completedStr = inst.completed_at!.toLocaleDateString("fr-FR");
      const hoursAgo = Math.round(
        (Date.now() - inst.completed_at!.getTime()) / 3_600_000
      );
      const { subject, html, text } = genericEmail(
        "ANO-14",
        "Compte-rendu installation non soumis",
        inst.project.customer_id,
        inst.project.id,
        [
          `Installation terminée le : ${completedStr} (il y a ${hoursAgo}h)`,
          inst.technician_name ? `Technicien : ${inst.technician_name}` : "Technicien non renseigné",
          "Relancer le technicien pour soumettre le compte-rendu",
          "Le compte-rendu est requis pour clôturer le dossier",
        ].filter(Boolean) as string[]
      );
      return {
        ruleId: RULE_IDS.ANO_14,
        projectId: inst.project.id,
        orderId: null,
        installationId: inst.id,
        eventId: undefined as unknown as string,
        recipients: [r("coordinateur")],
        subject,
        bodyHtml: html,
        bodyText: text,
      };
    });
  },
};

// =============================================================================
// ANO-17 — Consolidation incomplète J-3 avant date client (quotidien)
// =============================================================================
export const ano17: ScheduledRule = {
  ruleId: RULE_IDS.ANO_17,
  name: "Consolidation incomplète J-3 date client",
  frequency: "daily",
  async evaluate(): Promise<RuleResult[]> {
    const now = new Date();
    const in3days = new Date(Date.now() + 3 * 86_400_000);

    // Consolidations pas complètes pour des projets dont la livraison est dans 3 jours
    const consolidations = await prisma.consolidation.findMany({
      where: {
        status: { in: ["waiting", "in_progress"] },
        project: {
          orders: {
            some: {
              promised_delivery_date: { gte: now, lte: in3days },
            },
          },
        },
      },
      include: {
        project: {
          select: {
            id: true,
            customer_id: true,
            orders: {
              where: { promised_delivery_date: { gte: now, lte: in3days } },
              select: { promised_delivery_date: true, erp_order_ref: true },
            },
          },
        },
      },
    });

    return consolidations.map((conso) => {
      const missingCount =
        conso.orders_required.length - conso.orders_arrived.length;
      const nextDelivery = conso.project.orders
        .map((o) => o.promised_delivery_date)
        .filter(Boolean)
        .sort((a, b) => a!.getTime() - b!.getTime())[0];
      const deliveryStr = nextDelivery
        ? nextDelivery.toLocaleDateString("fr-FR")
        : "non renseignée";

      const { subject, html, text } = genericEmail(
        "ANO-17",
        "Consolidation incomplète J-3 date client",
        conso.project.customer_id,
        conso.project.id,
        [
          `Date de livraison promise : ${deliveryStr}`,
          `Commandes manquantes en station : ${missingCount} / ${conso.orders_required.length}`,
          `ETA estimée consolidation : ${conso.estimated_complete_date?.toLocaleDateString("fr-FR") ?? "non calculée"}`,
          "Évaluer si un report de livraison est nécessaire",
          "Proposer un nouveau créneau au client si applicable",
        ]
      );
      return {
        ruleId: RULE_IDS.ANO_17,
        projectId: conso.project_id,
        orderId: null,
        installationId: null,
        eventId: undefined as unknown as string,
        recipients: [r("coordinateur")],
        subject,
        bodyHtml: html,
        bodyText: text,
      };
    });
  },
};

// =============================================================================
// ANO-21 — Silence OMS >24h sur commande en transit (horaire)
// =============================================================================
export const ano21: ScheduledRule = {
  ruleId: RULE_IDS.ANO_21,
  name: "Silence OMS >24h — commande en transit sans mise à jour",
  frequency: "hourly",
  async evaluate(): Promise<RuleResult[]> {
    const limit24hAgo = new Date(Date.now() - 24 * 3_600_000);

    // Shipments en transit dont le dernier event OMS date de >24h
    const shipments = await prisma.shipment.findMany({
      where: {
        status: { in: ["dispatched", "in_transit"] },
        updated_at: { lte: limit24hAgo },
      },
      include: {
        order: {
          select: {
            id: true,
            erp_order_ref: true,
            project: { select: { id: true, customer_id: true } },
          },
        },
      },
    });

    // Déduplication par projet (une seule alerte par projet)
    const seen = new Set<string>();
    const results: RuleResult[] = [];

    for (const shipment of shipments) {
      const projectId = shipment.order.project.id;
      if (seen.has(projectId)) continue;
      seen.add(projectId);

      const hoursAgo = Math.round(
        (Date.now() - shipment.updated_at.getTime()) / 3_600_000
      );
      const { subject, html, text } = genericEmail(
        "ANO-21",
        "Silence OMS >24h — expédition sans mise à jour",
        shipment.order.project.customer_id,
        projectId,
        [
          `Commande : ${shipment.order.erp_order_ref ?? shipment.order.id}`,
          `Transporteur : ${shipment.carrier ?? "non renseigné"}`,
          `Suivi : ${shipment.carrier_tracking_ref ?? "non renseigné"}`,
          `Dernière mise à jour : il y a ${hoursAgo}h`,
          "Vérifier l'état de l'expédition auprès du transporteur",
          "S'assurer que l'OMS reçoit bien les mises à jour",
        ]
      );
      results.push({
        ruleId: RULE_IDS.ANO_21,
        projectId,
        orderId: shipment.order.id,
        installationId: null,
        eventId: undefined as unknown as string,
        recipients: [r("ops")],
        subject,
        bodyHtml: html,
        bodyText: text,
      });
    }
    return results;
  },
};

// =============================================================================
// Export
// =============================================================================
export const HOURLY_RULES: ScheduledRule[] = [ano08, ano09, ano13, ano14, ano21];
export const DAILY_RULES: ScheduledRule[] = [ano07, ano10, ano17];
