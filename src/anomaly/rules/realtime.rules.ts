import { prisma } from "../../lib/prisma.js";
import { config } from "../../config.js";
import { RULE_IDS } from "../rule-ids.js";
import type { RealtimeRule, RuleResult, Recipient } from "../types.js";
import { ano01Subject, ano01Html, ano01Text } from "../../templates/ano01.template.js";
import { ano02Subject, ano02Html, ano02Text } from "../../templates/ano02.template.js";
import { ano06Subject, ano06Html, ano06Text } from "../../templates/ano06.template.js";

// =============================================================================
// Règles d'anomalie temps réel — déclenchées à chaque ingestion d'événement
// =============================================================================

const emails = config.ALERT_EMAILS;

function r(role: keyof typeof emails): Recipient {
  return { email: emails[role], role };
}

/** Génère un email générique pour les règles sans template dédié */
function genericEmail(
  anoId: string,
  anoName: string,
  customerId: string,
  projectId: string,
  details: string[]
): { subject: string; html: string; text: string } {
  const subject = `[PLO] 🔴 ${anoName} (${customerId})`;
  const detailRows = details
    .map((d) => `<li>${d}</li>`)
    .join("");
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #dc2626; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
    <strong>🔴 ALERTE — ${anoId} : ${anoName}</strong>
  </div>
  <div style="border: 1px solid #dc2626; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
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
// ANO-01 — Stock manquant tardif (< 72h avant livraison)
// =============================================================================
const ano01: RealtimeRule = {
  ruleId: RULE_IDS.ANO_01,
  name: "Stock manquant tardif",
  triggers: ["stock.shortage"],
  async evaluate(ctx): Promise<RuleResult | null> {
    const order = ctx.order;
    if (!order?.promised_delivery_date) return null;

    const hoursRemaining =
      (order.promised_delivery_date.getTime() - Date.now()) / 3_600_000;
    if (hoursRemaining > 72) return null;

    const payload = ctx.event.payload as Record<string, unknown> | null;
    const sku = (payload?.["sku"] as string) ?? "inconnu";
    const skuLabel = payload?.["label"] as string | undefined;

    const data = {
      projectId: ctx.project.id,
      customerId: ctx.project.customer_id,
      orderId: order.id,
      erpRef: order.erp_order_ref ?? null,
      sku,
      skuLabel,
      promisedDeliveryDate: order.promised_delivery_date,
      hoursRemaining,
    };

    return {
      ruleId: RULE_IDS.ANO_01,
      projectId: ctx.project.id,
      orderId: order.id,
      installationId: null,
      eventId: ctx.event.id,
      recipients: [r("coordinateur"), r("acheteur")],
      subject: ano01Subject(data),
      bodyHtml: ano01Html(data),
      bodyText: ano01Text(data),
    };
  },
};

// =============================================================================
// ANO-02 — Écart picking avant départ camion
// =============================================================================
const ano02: RealtimeRule = {
  ruleId: RULE_IDS.ANO_02,
  name: "Écart picking avant départ",
  triggers: ["picking.discrepancy"],
  async evaluate(ctx): Promise<RuleResult | null> {
    if (!ctx.order) return null;

    // Y a-t-il déjà un shipment dispatché / en transit pour cette commande ?
    const dispatchedShipment = await prisma.shipment.findFirst({
      where: {
        order_id: ctx.order.id,
        status: { in: ["dispatched", "in_transit", "arrived"] },
      },
    });
    if (dispatchedShipment) return null; // → ANO-03 à la place

    const payload = ctx.event.payload as Record<string, unknown> | null;
    const data = {
      projectId: ctx.project.id,
      customerId: ctx.project.customer_id,
      orderId: ctx.order.id,
      erpRef: ctx.order.erp_order_ref ?? null,
      discrepancyDetail: payload?.["detail"] as string | undefined,
      promisedDeliveryDate: ctx.order.promised_delivery_date,
    };

    return {
      ruleId: RULE_IDS.ANO_02,
      projectId: ctx.project.id,
      orderId: ctx.order.id,
      installationId: null,
      eventId: ctx.event.id,
      recipients: [r("entrepot")],
      subject: ano02Subject(data),
      bodyHtml: ano02Html(data),
      bodyText: ano02Text(data),
    };
  },
};

// =============================================================================
// ANO-03 — Produit oublié détecté après départ du camion
// =============================================================================
const ano03: RealtimeRule = {
  ruleId: RULE_IDS.ANO_03,
  name: "Produit oublié après départ camion",
  triggers: ["picking.discrepancy"],
  async evaluate(ctx): Promise<RuleResult | null> {
    if (!ctx.order) return null;

    const dispatchedShipment = await prisma.shipment.findFirst({
      where: {
        order_id: ctx.order.id,
        status: { in: ["dispatched", "in_transit", "arrived"] },
      },
    });
    if (!dispatchedShipment) return null; // → ANO-02 à la place

    const payload = ctx.event.payload as Record<string, unknown> | null;
    const detail = (payload?.["detail"] as string) ?? "Écart constaté après chargement";
    const { subject, html, text } = genericEmail(
      "ANO-03",
      "Produit oublié après départ camion",
      ctx.project.customer_id,
      ctx.project.id,
      [
        `Commande : ${ctx.order.erp_order_ref ?? ctx.order.id}`,
        `Incident : ${detail}`,
        "Contacter immédiatement le TMS et informer l'installateur",
        "Prévoir la livraison du produit manquant séparément",
      ]
    );

    return {
      ruleId: RULE_IDS.ANO_03,
      projectId: ctx.project.id,
      orderId: ctx.order.id,
      installationId: null,
      eventId: ctx.event.id,
      recipients: [r("coordinateur"), r("ops")],
      subject,
      bodyHtml: html,
      bodyText: text,
    };
  },
};

// =============================================================================
// ANO-04 — Livraison partielle alors que l'installation est dans moins de 48h
// =============================================================================
const ano04: RealtimeRule = {
  ruleId: RULE_IDS.ANO_04,
  name: "Livraison partielle avant pose imminente",
  triggers: ["lastmile.partial_delivered"],
  async evaluate(ctx): Promise<RuleResult | null> {
    const installation = ctx.project.installation;
    if (!installation?.scheduled_date) return null;

    const hoursToInstall =
      (installation.scheduled_date.getTime() - Date.now()) / 3_600_000;
    if (hoursToInstall > 48) return null;

    const { subject, html, text } = genericEmail(
      "ANO-04",
      "Livraison partielle — installation dans moins de 48h",
      ctx.project.customer_id,
      ctx.project.id,
      [
        `Livraison partielle effectuée`,
        `Installation prévue dans ${Math.round(hoursToInstall)}h`,
        "Vérifier si les produits manquants sont nécessaires à l'installation",
        "Étudier le rebooking de l'installation ou une livraison complémentaire express",
      ]
    );

    return {
      ruleId: RULE_IDS.ANO_04,
      projectId: ctx.project.id,
      orderId: ctx.order?.id ?? null,
      installationId: installation.id,
      eventId: ctx.event.id,
      recipients: [r("coordinateur")],
      subject,
      bodyHtml: html,
      bodyText: text,
    };
  },
};

// =============================================================================
// ANO-05 — Installation planifiée sans livraison confirmée (last mile)
// =============================================================================
const ano05: RealtimeRule = {
  ruleId: RULE_IDS.ANO_05,
  name: "Installation planifiée sans livraison confirmée",
  triggers: ["installation.scheduled"],
  async evaluate(ctx): Promise<RuleResult | null> {
    const lastmile = ctx.project.last_mile;
    const consolidation = ctx.project.consolidation;

    // OK si last mile delivered ou consolidation complete/partial_approved
    if (lastmile?.status === "delivered" || lastmile?.status === "partial_delivered") return null;
    if (
      consolidation?.status === "complete" ||
      consolidation?.status === "partial_approved"
    )
      return null;

    const { subject, html, text } = genericEmail(
      "ANO-05",
      "Installation planifiée sans livraison confirmée",
      ctx.project.customer_id,
      ctx.project.id,
      [
        "Une intervention a été planifiée alors qu'aucune livraison client n'est confirmée",
        `Statut last mile : ${lastmile?.status ?? "non créé"}`,
        `Statut consolidation : ${consolidation?.status ?? "non créée"}`,
        "Bloquer l'intervention et vérifier avec le coordinateur",
      ]
    );

    return {
      ruleId: RULE_IDS.ANO_05,
      projectId: ctx.project.id,
      orderId: null,
      installationId: ctx.installation?.id ?? null,
      eventId: ctx.event.id,
      recipients: [r("coordinateur")],
      subject,
      bodyHtml: html,
      bodyText: text,
    };
  },
};

// =============================================================================
// ANO-06 — Problème constaté pendant l'installation
// =============================================================================
const ano06: RealtimeRule = {
  ruleId: RULE_IDS.ANO_06,
  name: "Problème pendant installation",
  triggers: ["installation.issue"],
  async evaluate(ctx): Promise<RuleResult | null> {
    const payload = ctx.event.payload as Record<string, unknown> | null;
    const severity = payload?.["severity"] as string | undefined;
    const isBlocking = severity === "blocking" || payload?.["is_blocking"] === true;

    const installation = ctx.project.installation;
    const data = {
      projectId: ctx.project.id,
      customerId: ctx.project.customer_id,
      installationId: installation?.id ?? null,
      technicianName: installation?.technician_name ?? undefined,
      issueType: payload?.["issue_type"] as string | undefined,
      issueDescription: payload?.["description"] as string | undefined,
      scheduledDate: installation?.scheduled_date ?? null,
      isBlocking,
    };

    return {
      ruleId: RULE_IDS.ANO_06,
      projectId: ctx.project.id,
      orderId: null,
      installationId: installation?.id ?? null,
      eventId: ctx.event.id,
      recipients: [r("coordinateur")],
      subject: ano06Subject(data),
      bodyHtml: ano06Html(data),
      bodyText: ano06Text(data),
    };
  },
};

// =============================================================================
// ANO-11 — Installation planifiée sans que les commandes prérequises soient livrées
// =============================================================================
const ano11: RealtimeRule = {
  ruleId: RULE_IDS.ANO_11,
  name: "Installation planifiée — commandes prérequises non livrées",
  triggers: ["installation.scheduled"],
  async evaluate(ctx): Promise<RuleResult | null> {
    const installation = ctx.project.installation;
    if (!installation) return null;

    const prereqs = installation.orders_prerequisite;
    if (prereqs.length === 0) return null;

    const undelivered = ctx.project.orders.filter(
      (o) =>
        prereqs.includes(o.id) &&
        o.status !== "delivered" &&
        o.status !== "installed" &&
        o.status !== "closed"
    );
    if (undelivered.length === 0) return null;

    const undeliveredRefs = undelivered
      .map((o) => o.erp_order_ref ?? o.id)
      .join(", ");

    const { subject, html, text } = genericEmail(
      "ANO-11",
      "Installation planifiée — commandes prérequises non livrées",
      ctx.project.customer_id,
      ctx.project.id,
      [
        `Commandes non livrées : ${undeliveredRefs}`,
        "L'installation ne peut pas se dérouler sans ces produits",
        "Bloquer l'intervention et vérifier le planning de livraison",
      ]
    );

    return {
      ruleId: RULE_IDS.ANO_11,
      projectId: ctx.project.id,
      orderId: null,
      installationId: installation.id,
      eventId: ctx.event.id,
      recipients: [r("coordinateur")],
      subject,
      bodyHtml: html,
      bodyText: text,
    };
  },
};

// =============================================================================
// ANO-12 — Incident bloquant en installation
// =============================================================================
const ano12: RealtimeRule = {
  ruleId: RULE_IDS.ANO_12,
  name: "Incident bloquant en installation",
  triggers: ["installation.issue"],
  async evaluate(ctx): Promise<RuleResult | null> {
    const payload = ctx.event.payload as Record<string, unknown> | null;
    const severity = payload?.["severity"] as string | undefined;
    const isBlocking = severity === "blocking" || payload?.["is_blocking"] === true;
    if (!isBlocking) return null;

    const installation = ctx.project.installation;
    const data = {
      projectId: ctx.project.id,
      customerId: ctx.project.customer_id,
      installationId: installation?.id ?? null,
      technicianName: installation?.technician_name ?? undefined,
      issueType: payload?.["issue_type"] as string | undefined,
      issueDescription: payload?.["description"] as string | undefined,
      scheduledDate: installation?.scheduled_date ?? null,
      isBlocking: true,
    };

    return {
      ruleId: RULE_IDS.ANO_12,
      projectId: ctx.project.id,
      orderId: null,
      installationId: installation?.id ?? null,
      eventId: ctx.event.id,
      recipients: [r("coordinateur"), r("manager")],
      subject: ano06Subject(data),
      bodyHtml: ano06Html(data),
      bodyText: ano06Text(data),
    };
  },
};

// =============================================================================
// ANO-15 — Refus de signature client
// =============================================================================
const ano15: RealtimeRule = {
  ruleId: RULE_IDS.ANO_15,
  name: "Refus signature client",
  triggers: [
    "installation.completed",
    "lastmile.delivered",
    "customer_signature.refused",
  ],
  async evaluate(ctx): Promise<RuleResult | null> {
    const payload = ctx.event.payload as Record<string, unknown> | null;
    const sig = payload?.["customer_signature"] as Record<string, unknown> | undefined;
    if (!sig) return null;
    if (sig["signed"] !== false) return null;

    const { subject, html, text } = genericEmail(
      "ANO-15",
      "Refus de signature client",
      ctx.project.customer_id,
      ctx.project.id,
      [
        "Le client a refusé de signer le bon de livraison ou le compte-rendu",
        `Événement : ${ctx.event.event_type}`,
        "Créer un ticket litige dans le CRM",
        "Contacter le client pour comprendre le motif du refus",
      ]
    );

    return {
      ruleId: RULE_IDS.ANO_15,
      projectId: ctx.project.id,
      orderId: ctx.order?.id ?? null,
      installationId: ctx.installation?.id ?? null,
      eventId: ctx.event.id,
      recipients: [r("coordinateur")],
      subject,
      bodyHtml: html,
      bodyText: text,
    };
  },
};

// =============================================================================
// ANO-16 — ETA Shipment dépasse la date de livraison client promise
// =============================================================================
const ano16: RealtimeRule = {
  ruleId: RULE_IDS.ANO_16,
  name: "ETA Shipment dépasse date de livraison promise",
  triggers: ["shipment.eta_updated"],
  async evaluate(ctx): Promise<RuleResult | null> {
    const order = ctx.order;
    if (!order?.promised_delivery_date) return null;

    const payload = ctx.event.payload as Record<string, unknown> | null;
    const newEtaStr =
      (payload?.["new_eta"] as string) ??
      (payload?.["estimated_arrival"] as string);
    if (!newEtaStr) return null;

    const newEta = new Date(newEtaStr);
    if (isNaN(newEta.getTime())) return null;
    if (newEta <= order.promised_delivery_date) return null;

    const overlapDays = Math.round(
      (newEta.getTime() - order.promised_delivery_date.getTime()) / 86_400_000
    );
    const etaStr = newEta.toLocaleDateString("fr-FR");
    const promisedStr = order.promised_delivery_date.toLocaleDateString("fr-FR");

    const { subject, html, text } = genericEmail(
      "ANO-16",
      "ETA expédition dépasse date de livraison promise",
      ctx.project.customer_id,
      ctx.project.id,
      [
        `Commande : ${order.erp_order_ref ?? order.id}`,
        `Nouvelle ETA : ${etaStr}`,
        `Date promise client : ${promisedStr}`,
        `Dépassement : +${overlapDays} jour(s)`,
        "Informer le client du retard de manière proactive",
        "Recalculer la date de livraison consolidée",
        "Envisager le report de l'installation si applicable",
      ]
    );

    return {
      ruleId: RULE_IDS.ANO_16,
      projectId: ctx.project.id,
      orderId: order.id,
      installationId: null,
      eventId: ctx.event.id,
      recipients: [r("coordinateur")],
      subject,
      bodyHtml: html,
      bodyText: text,
    };
  },
};

// =============================================================================
// ANO-18 — Exception en delivery station (colis manquant ou endommagé)
// =============================================================================
const ano18: RealtimeRule = {
  ruleId: RULE_IDS.ANO_18,
  name: "Exception en delivery station",
  triggers: ["consolidation.exception"],
  async evaluate(ctx): Promise<RuleResult | null> {
    const payload = ctx.event.payload as Record<string, unknown> | null;
    const reason = (payload?.["reason"] as string) ?? "Incident non détaillé";

    const { subject, html, text } = genericEmail(
      "ANO-18",
      "Exception en delivery station",
      ctx.project.customer_id,
      ctx.project.id,
      [
        `Motif : ${reason}`,
        "Vérifier l'état des colis en station",
        "Recalculer la date prévisionnelle de livraison client",
        "Prévoir un réapprovisionnement ou un remplacement si nécessaire",
      ]
    );

    return {
      ruleId: RULE_IDS.ANO_18,
      projectId: ctx.project.id,
      orderId: null,
      installationId: null,
      eventId: ctx.event.id,
      recipients: [r("coordinateur"), r("acheteur")],
      subject,
      bodyHtml: html,
      bodyText: text,
    };
  },
};

// =============================================================================
// ANO-19 — Last mile planifié sans consolidation complète ni accord partiel
// =============================================================================
const ano19: RealtimeRule = {
  ruleId: RULE_IDS.ANO_19,
  name: "Last mile sans consolidation",
  triggers: ["lastmile.scheduled"],
  async evaluate(ctx): Promise<RuleResult | null> {
    const consolidation = ctx.project.consolidation;
    if (!consolidation) return null;

    if (
      consolidation.status === "complete" ||
      consolidation.status === "partial_approved"
    )
      return null;

    const missing = consolidation.orders_required.filter(
      (id) => !consolidation.orders_arrived.includes(id)
    );

    const { subject, html, text } = genericEmail(
      "ANO-19",
      "Last mile planifié sans consolidation complète",
      ctx.project.customer_id,
      ctx.project.id,
      [
        `Statut consolidation : ${consolidation.status}`,
        `Commandes manquantes en station : ${missing.length}`,
        "Le last mile ne peut partir qu'après consolidation complète ou accord partiel",
        "Bloquer la tournée et contacter le coordinateur",
      ]
    );

    return {
      ruleId: RULE_IDS.ANO_19,
      projectId: ctx.project.id,
      orderId: null,
      installationId: null,
      eventId: ctx.event.id,
      recipients: [r("coordinateur")],
      subject,
      bodyHtml: html,
      bodyText: text,
    };
  },
};

// =============================================================================
// ANO-20 — Last mile partiel effectué sans accord préalable client + installateur
// =============================================================================
const ano20: RealtimeRule = {
  ruleId: RULE_IDS.ANO_20,
  name: "Last mile partiel sans accord préalable",
  triggers: ["lastmile.partial_delivered"],
  async evaluate(ctx): Promise<RuleResult | null> {
    const consolidation = ctx.project.consolidation;
    if (consolidation?.partial_delivery_approved === true) return null;

    const { subject, html, text } = genericEmail(
      "ANO-20",
      "Livraison partielle effectuée sans accord préalable",
      ctx.project.customer_id,
      ctx.project.id,
      [
        "Une livraison partielle a été effectuée sans accord formel du client et de l'installateur",
        "Cette situation peut bloquer le déclenchement de l'installation",
        "Obtenir rétroactivement l'accord client et installateur",
        "Escalader au manager pour décision",
      ]
    );

    return {
      ruleId: RULE_IDS.ANO_20,
      projectId: ctx.project.id,
      orderId: null,
      installationId: null,
      eventId: ctx.event.id,
      recipients: [r("manager")],
      subject,
      bodyHtml: html,
      bodyText: text,
    };
  },
};

// =============================================================================
// ANO-22 — Échec livraison last mile
// =============================================================================
const ano22: RealtimeRule = {
  ruleId: RULE_IDS.ANO_22,
  name: "Last mile échoué",
  triggers: ["lastmile.failed"],
  async evaluate(ctx): Promise<RuleResult | null> {
    const payload = ctx.event.payload as Record<string, unknown> | null;
    const reason = (payload?.["reason"] as string) ?? "Motif non précisé";
    const lastmile = ctx.project.last_mile;

    const { subject, html, text } = genericEmail(
      "ANO-22",
      "Échec livraison last mile",
      ctx.project.customer_id,
      ctx.project.id,
      [
        `Motif : ${reason}`,
        lastmile?.scheduled_date
          ? `Créneau prévu : ${lastmile.scheduled_date.toLocaleDateString("fr-FR")}`
          : "",
        "Contacter le client pour reprogrammer la livraison",
        "Notifier le coordinateur installation pour report éventuel de l'intervention",
        "Créer un ticket de replanification",
      ].filter(Boolean) as string[]
    );

    return {
      ruleId: RULE_IDS.ANO_22,
      projectId: ctx.project.id,
      orderId: null,
      installationId: null,
      eventId: ctx.event.id,
      recipients: [r("coordinateur"), r("ops")],
      subject,
      bodyHtml: html,
      bodyText: text,
    };
  },
};

// =============================================================================
// Export — liste complète des règles temps réel
// =============================================================================
export const REALTIME_RULES: RealtimeRule[] = [
  ano01,
  ano02,
  ano03,
  ano04,
  ano05,
  ano06,
  ano11,
  ano12,
  ano15,
  ano16,
  ano18,
  ano19,
  ano20,
  ano22,
];
