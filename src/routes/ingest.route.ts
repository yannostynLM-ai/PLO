import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getAdapter } from "../adapters/registry.js";
import { AdapterError } from "../adapters/types.js";
import { ingestEvent } from "../services/event.service.js";

// =============================================================================
// Route POST /api/events/ingest
// =============================================================================

const IngestBodySchema = z.object({
  source_ref: z.string().min(1, "source_ref requis"),
  event_type: z.string().min(1, "event_type requis"),
  project_ref: z.string().min(1, "project_ref requis"),
  occurred_at: z.string().datetime({ message: "occurred_at doit être ISO8601" }),
  order_ref: z.string().optional(),
  payload: z.record(z.unknown()).optional().default({}),
});

export const ingestRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/events/ingest", async (request, reply) => {
    // ------------------------------------------------------------------
    // 1. Validation du corps de la requête
    // ------------------------------------------------------------------
    const bodyResult = IngestBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: "Payload invalide",
        details: bodyResult.error.flatten(),
      });
    }

    const body = bodyResult.data;
    // authenticatedSource est garanti non-null par le hook auth (qui termine la requête sinon)
    const source = request.authenticatedSource!;

    // ------------------------------------------------------------------
    // 2. Adaptation (validation source-spécifique + normalisation)
    // ------------------------------------------------------------------
    let normalized;
    try {
      const adapter = getAdapter(source);
      normalized = adapter.adapt({ ...body, source });
    } catch (err) {
      if (err instanceof AdapterError) {
        return reply.code(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: err.message,
          details: err.details,
        });
      }
      throw err;
    }

    // ------------------------------------------------------------------
    // 3. Ingestion (résolution projet, dédup, persistance, enqueue)
    // ------------------------------------------------------------------
    const result = await ingestEvent(normalized);

    switch (result.status) {
      case "duplicate":
        return reply.code(200).send({
          duplicate: true,
          event_id: result.event_id,
          message: "Événement déjà reçu — ignoré silencieusement",
        });

      case "dead_letter":
        return reply.code(202).send({
          queued: false,
          dead_letter: true,
          message: result.message,
        });

      case "created":
        return reply.code(201).send({
          event_id: result.event_id,
          project_id: result.project_id,
          message: "Événement reçu et mis en file de traitement",
        });
    }
  });
};
