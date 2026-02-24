import { Worker } from "bullmq";
import { redis } from "../lib/redis.js";
import { EVENT_QUEUE, type EventJobData } from "../lib/queue.js";
import { upsertStep } from "../services/step.service.js";
import { applyEntityUpdates } from "../services/entity.service.js";
import { evaluateRealTimeRules } from "../anomaly/engine.js";

// =============================================================================
// Worker BullMQ — Traitement asynchrone des événements ingérés
//
// Responsabilités :
//   1. Mettre à jour le Step correspondant (upsert)
//   2. Appliquer les mises à jour d'entités métier (Order, Shipment, etc.)
//   3. (Sprint 3) Évaluer les règles d'anomalie
// =============================================================================

export function createEventWorker() {
  const worker = new Worker<EventJobData>(
    EVENT_QUEUE,
    async (job) => {
      const { eventId, projectId, orderId, installationId, eventType, payload } = job.data;

      try {
        // 1. Upsert du Step
        const stepId = await upsertStep({
          event_type: eventType,
          project_id: projectId,
          order_id: orderId,
          installation_id: installationId,
        });

        if (stepId) {
          // Rattache le step_id à l'Event en base
          const { prisma } = await import("../lib/prisma.js");
          await prisma.event.update({
            where: { id: eventId },
            data: { step_id: stepId },
          });
        }

        // 2. Mises à jour d'entités
        await applyEntityUpdates({
          event_type: eventType,
          project_id: projectId,
          order_id: orderId,
          installation_id: installationId,
          payload,
        });

        // 3. Évaluation des règles d'anomalie temps réel
        await evaluateRealTimeRules({
          eventId,
          projectId,
          orderId,
          installationId,
          eventType,
        });

      } catch (err) {
        console.error(`[Worker] Erreur sur job ${job.id} (${eventType}):`, err);
        throw err; // BullMQ relance selon la config retry
      }
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Worker] ✓ Job ${job.id} (${job.data.eventType}) traité`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] ✗ Job ${job?.id} (${job?.data.eventType}) échoué:`, err.message);
  });

  return worker;
}
