import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// Routes publiques — Règles d'anomalie
// GET   /api/rules      — toutes les règles
// PATCH /api/rules/:id  — toggle actif/inactif
// =============================================================================

const PatchRuleBodySchema = z.object({
  active: z.boolean(),
});

export const rulesRoute: FastifyPluginAsync = async (fastify) => {
  // --------------------------------------------------------------------------
  // GET /api/rules
  // --------------------------------------------------------------------------
  fastify.get("/api/rules", async (_request, reply) => {
    const rules = await prisma.anomalyRule.findMany({
      orderBy: { created_at: "asc" },
    });
    return reply.send({ rules });
  });

  // --------------------------------------------------------------------------
  // PATCH /api/rules/:id
  // --------------------------------------------------------------------------
  fastify.patch<{ Params: { id: string } }>(
    "/api/rules/:id",
    async (request, reply) => {
      const { id } = request.params;

      const bodyResult = PatchRuleBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: "Payload invalide",
          details: bodyResult.error.flatten(),
        });
      }

      const rule = await prisma.anomalyRule.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!rule) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Règle introuvable",
        });
      }

      const updated = await prisma.anomalyRule.update({
        where: { id },
        data: { active: bodyResult.data.active },
      });

      return reply.send({ rule: updated });
    }
  );
};
