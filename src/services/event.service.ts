import type { EventSource } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { eventQueue, deadLetterQueue, type EventJobData } from "../lib/queue.js";
import type { NormalizedEvent } from "../adapters/types.js";

// =============================================================================
// Event Service — Persistance, déduplication, résolution projet, file d'attente
// =============================================================================

export interface IngestResult {
  status: "created" | "duplicate" | "dead_letter";
  event_id?: string;
  project_id?: string;
  message?: string;
}

/**
 * Pipeline principal d'ingestion d'un événement normalisé.
 *
 * 1. Résolution du projet via project_ref
 * 2. Déduplication (source + source_ref)
 * 3. Persistance de l'Event
 * 4. Enqueue du job de traitement asynchrone
 */
export async function ingestEvent(event: NormalizedEvent): Promise<IngestResult> {
  // ------------------------------------------------------------------
  // 1. Résolution du projet
  // ------------------------------------------------------------------
  const project = await resolveProject(event.project_ref, event.source);

  if (!project) {
    // Projet introuvable → Dead Letter Queue
    await deadLetterQueue.add("unresolved", {
      source: event.source,
      source_ref: event.source_ref,
      event_type: event.event_type,
      project_ref: event.project_ref,
      occurred_at: event.occurred_at.toISOString(),
      payload: event.payload,
    });

    return {
      status: "dead_letter",
      message: `Projet introuvable pour la référence '${event.project_ref}' (source: ${event.source})`,
    };
  }

  // ------------------------------------------------------------------
  // 2. Déduplication — source + source_ref doit être unique
  // ------------------------------------------------------------------
  const existing = await prisma.event.findUnique({
    where: { dedup_source_ref: { source: event.source, source_ref: event.source_ref } },
    select: { id: true },
  });

  if (existing) {
    return { status: "duplicate", event_id: existing.id };
  }

  // ------------------------------------------------------------------
  // 3. Résolution de l'Order (si order_ref fourni)
  // ------------------------------------------------------------------
  let orderId: string | null = null;
  if (event.order_ref) {
    const order = await prisma.order.findFirst({
      where: {
        project_id: project.id,
        OR: [
          { erp_order_ref: event.order_ref },
          { ecommerce_order_ref: event.order_ref },
        ],
      },
      select: { id: true },
    });
    orderId = order?.id ?? null;
  }

  // ------------------------------------------------------------------
  // 4. Persistance de l'Event
  // ------------------------------------------------------------------
  const severity = deriveSeverity(event.event_type);

  const persisted = await prisma.event.create({
    data: {
      project_id: project.id,
      order_id: orderId,
      event_type: event.event_type,
      source: event.source,
      source_ref: event.source_ref,
      severity,
      payload: event.payload as Prisma.InputJsonValue,
      processed_at: new Date(),
    },
  });

  // ------------------------------------------------------------------
  // 5. Enqueue du job de traitement (step + entity updates)
  // ------------------------------------------------------------------
  const jobData: EventJobData = {
    eventId: persisted.id,
    projectId: project.id,
    orderId,
    installationId: null,
    eventType: event.event_type,
    source: event.source,
    payload: event.payload,
  };

  await eventQueue.add(event.event_type, jobData, {
    jobId: persisted.id, // Idempotence au niveau queue
  });

  return {
    status: "created",
    event_id: persisted.id,
    project_id: project.id,
  };
}

// ------------------------------------------------------------------
// Résolution du projet via ProjectExternalRef
// Cherche d'abord par (source, ref), puis par ref seule (cross-source)
// ------------------------------------------------------------------
async function resolveProject(
  projectRef: string,
  source: EventSource
): Promise<{ id: string } | null> {
  // Tentative source-spécifique
  const exact = await prisma.projectExternalRef.findUnique({
    where: { source_ref: { source, ref: projectRef } },
    select: { project: { select: { id: true } } },
  });
  if (exact) return exact.project;

  // Fallback cross-source
  const fallback = await prisma.projectExternalRef.findFirst({
    where: { ref: projectRef },
    select: { project: { select: { id: true } } },
  });
  if (fallback) return fallback.project;

  // Dernière tentative : le project_ref est peut-être directement un project_id UUID
  const direct = await prisma.project.findUnique({
    where: { id: projectRef },
    select: { id: true },
  });
  return direct ?? null;
}

// ------------------------------------------------------------------
// Dérive la sévérité à partir du type d'événement
// ------------------------------------------------------------------
const CRITICAL_EVENT_TYPES = new Set([
  "stock.shortage",
  "picking.discrepancy",
  "shipment.exception",
  "consolidation.exception",
  "lastmile.failed",
  "lastmile.partial_delivered",
  "lastmile.damaged",
  "installation.issue",
  "installation.partial",
  "quality.issue_raised",
]);

const WARNING_EVENT_TYPES = new Set([
  "stock.partial",
  "inspiration.abandoned",
  "quote_products.expired",
  "shipment.eta_updated",
  "consolidation.eta_updated",
  "lastmile.rescheduled",
  "installation.rescheduled",
  "installation.cancelled",
]);

export function deriveSeverity(event_type: string): "critical" | "warning" | "info" {
  if (CRITICAL_EVENT_TYPES.has(event_type)) return "critical";
  if (WARNING_EVENT_TYPES.has(event_type)) return "warning";
  return "info";
}
