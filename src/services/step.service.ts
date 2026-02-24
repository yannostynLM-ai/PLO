import type { StepStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// Step Service — Upsert des étapes du cycle de vie
// =============================================================================

interface StepMapping {
  step_type: string;
  new_status: StepStatus;
  level: "project" | "order" | "installation";
}

/** Mapping event_type → step cible et nouveau statut */
const EVENT_TO_STEP: Record<string, StepMapping> = {
  // Inspiration
  "inspiration.started":   { step_type: "inspiration", new_status: "in_progress", level: "project" },
  "inspiration.completed": { step_type: "inspiration", new_status: "completed",   level: "project" },
  "inspiration.converted": { step_type: "inspiration", new_status: "completed",   level: "project" },
  "inspiration.abandoned": { step_type: "inspiration", new_status: "anomaly",     level: "project" },

  // Devis produits
  "quote_products.created":  { step_type: "quote_products", new_status: "in_progress", level: "project" },
  "quote_products.sent":     { step_type: "quote_products", new_status: "in_progress", level: "project" },
  "quote_products.accepted": { step_type: "quote_products", new_status: "completed",   level: "project" },
  "quote_products.expired":  { step_type: "quote_products", new_status: "anomaly",     level: "project" },

  // Devis installation
  "quote_installation.created":  { step_type: "quote_installation", new_status: "in_progress", level: "project" },
  "quote_installation.sent":     { step_type: "quote_installation", new_status: "in_progress", level: "project" },
  "quote_installation.accepted": { step_type: "quote_installation", new_status: "completed",   level: "project" },

  // Commande
  "order.confirmed": { step_type: "order_confirmed",   new_status: "completed",   level: "order" },
  "order.cancelled": { step_type: "order_confirmed",   new_status: "anomaly",     level: "order" },

  // Stock
  "stock.check_ok": { step_type: "stock_check", new_status: "completed", level: "order" },
  "stock.shortage": { step_type: "stock_check", new_status: "anomaly",   level: "order" },
  "stock.partial":  { step_type: "stock_check", new_status: "anomaly",   level: "order" },

  // Picking
  "picking.started":     { step_type: "picking_preparation", new_status: "in_progress", level: "order" },
  "picking.completed":   { step_type: "picking_preparation", new_status: "completed",   level: "order" },
  "picking.discrepancy": { step_type: "picking_preparation", new_status: "anomaly",     level: "order" },

  // Shipment
  "shipment.dispatched":          { step_type: "shipment_dispatched",          new_status: "in_progress", level: "order" },
  "shipment.in_transit":          { step_type: "shipment_in_transit",          new_status: "in_progress", level: "order" },
  "shipment.eta_updated":         { step_type: "shipment_dispatched",          new_status: "in_progress", level: "order" },
  "shipment.arrived_at_station":  { step_type: "shipment_arrived_at_station",  new_status: "completed",   level: "order" },
  "shipment.exception":           { step_type: "shipment_dispatched",          new_status: "anomaly",     level: "order" },

  // Consolidation
  "consolidation.order_arrived":    { step_type: "consolidation_in_progress", new_status: "in_progress", level: "project" },
  "consolidation.eta_updated":      { step_type: "consolidation_in_progress", new_status: "in_progress", level: "project" },
  "consolidation.complete":         { step_type: "consolidation_complete",    new_status: "completed",   level: "project" },
  "consolidation.partial_approved": { step_type: "consolidation_complete",    new_status: "completed",   level: "project" },
  "consolidation.exception":        { step_type: "consolidation_in_progress", new_status: "anomaly",     level: "project" },

  // Last mile
  "lastmile.scheduled":         { step_type: "lastmile_scheduled", new_status: "in_progress", level: "project" },
  "lastmile.rescheduled":       { step_type: "lastmile_scheduled", new_status: "in_progress", level: "project" },
  "lastmile.in_transit":        { step_type: "lastmile_scheduled", new_status: "in_progress", level: "project" },
  "lastmile.delivered":         { step_type: "lastmile_delivered", new_status: "completed",   level: "project" },
  "lastmile.partial_delivered": { step_type: "lastmile_delivered", new_status: "completed",   level: "project" },
  "lastmile.failed":            { step_type: "lastmile_delivered", new_status: "anomaly",     level: "project" },
  "lastmile.damaged":           { step_type: "lastmile_delivered", new_status: "anomaly",     level: "project" },

  // Installation
  "installation.scheduled":   { step_type: "installation_scheduled", new_status: "in_progress", level: "installation" },
  "installation.rescheduled": { step_type: "installation_scheduled", new_status: "in_progress", level: "installation" },
  "installation.cancelled":   { step_type: "installation_scheduled", new_status: "anomaly",     level: "installation" },
  "installation.started":     { step_type: "installation_started",   new_status: "in_progress", level: "installation" },
  "installation.completed":   { step_type: "installation_completed", new_status: "completed",   level: "installation" },
  "installation.issue":       { step_type: "installation_completed", new_status: "anomaly",     level: "installation" },
  "installation.partial":     { step_type: "installation_completed", new_status: "anomaly",     level: "installation" },

  // Clôture
  "project.closed":            { step_type: "project_closed", new_status: "completed", level: "project" },
  "project.closed_with_issue": { step_type: "project_closed", new_status: "anomaly",   level: "project" },
};

/**
 * Crée ou met à jour le Step correspondant à un événement.
 * Retourne null si aucun mapping n'est défini pour cet event_type.
 */
export async function upsertStep(params: {
  event_type: string;
  project_id: string;
  order_id: string | null;
  installation_id: string | null;
  step_id_hint?: string; // step_id déjà connu (de l'Event)
}): Promise<string | null> {
  const mapping = EVENT_TO_STEP[params.event_type];
  if (!mapping) return null;

  const { step_type, new_status, level } = mapping;

  // Détermine l'ID d'entité cible selon le niveau du step
  const entityKey =
    level === "project"
      ? "project_id"
      : level === "order"
        ? "order_id"
        : "installation_id";

  const entityId =
    level === "project"
      ? params.project_id
      : level === "order"
        ? params.order_id
        : params.installation_id;

  if (!entityId) return null;

  const now = new Date();

  // Cherche un step existant pour cette entité + step_type
  const existing = await prisma.step.findFirst({
    where: { [entityKey]: entityId, step_type },
  });

  if (existing) {
    await prisma.step.update({
      where: { id: existing.id },
      data: {
        status: new_status,
        completed_at: new_status === "completed" ? now : existing.completed_at,
        updated_at: now,
      },
    });
    return existing.id;
  }

  // Création d'un nouveau step
  const created = await prisma.step.create({
    data: {
      project_id: level === "project" ? params.project_id : null,
      order_id: level === "order" ? params.order_id : null,
      installation_id: level === "installation" ? params.installation_id : null,
      step_type,
      status: new_status,
      completed_at: new_status === "completed" ? now : null,
    },
  });

  return created.id;
}
