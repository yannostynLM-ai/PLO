import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// Routes — Journal d'activité (Sprint 16)
// GET /api/activity — entrées filtrables, 100 max par requête
// =============================================================================

const ActivityQuerySchema = z.object({
  entity_type: z.string().optional(),
  operator:    z.string().optional(),
  from:        z.string().optional(),
  to:          z.string().optional(),
  limit:       z.coerce.number().min(1).max(100).default(50),
});

export const activityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/activity", async (request, reply) => {
    const parseResult = ActivityQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: parseResult.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const { entity_type, operator, from, to, limit } = parseResult.data;

    const where = {
      ...(entity_type ? { entity_type }                                                                      : {}),
      ...(operator    ? { operator_name: { contains: operator, mode: "insensitive" as const } }              : {}),
      ...(from || to  ? { created_at: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    };

    const [entries, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return reply.send({ entries, total });
  });
};
