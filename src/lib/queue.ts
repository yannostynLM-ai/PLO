import { Queue } from "bullmq";
import { redis } from "./redis.js";

// =============================================================================
// Queues BullMQ
// =============================================================================

/** Job envoyé après persistance d'un événement — traité par event.worker.ts */
export interface EventJobData {
  eventId: string;
  projectId: string;
  orderId: string | null;
  installationId: string | null;
  eventType: string;
  source: string;
  payload: Record<string, unknown>;
}

/** File principale des événements à traiter */
export const EVENT_QUEUE = "plo-events";

/** Dead Letter Queue — événements dont le projet n'a pas pu être résolu */
export const DEAD_LETTER_QUEUE = "plo-events-dead";

export const eventQueue = new Queue<EventJobData>(EVENT_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const deadLetterQueue = new Queue<Record<string, unknown>>(
  DEAD_LETTER_QUEUE,
  {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: false, // Garder pour analyse ops
      removeOnFail: false,
    },
  }
);
