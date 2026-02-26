import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// Routes — Règles d'anomalie (Sprint 14 : CRUD complet admin)
// GET    /api/rules      — toutes les règles
// POST   /api/rules      — créer une règle (admin)
// PATCH  /api/rules/:id  — modifier (admin) — rétro-compatible avec { active }
// DELETE /api/rules/:id  — supprimer (admin)
// =============================================================================

const SCOPES = ["project", "order", "consolidation", "lastmile", "installation"] as const;
const SEVERITIES = ["warning", "critical"] as const;

const CreateRuleSchema = z.object({
  name:      z.string().min(1, "name requis"),
  scope:     z.enum(SCOPES),
  step_type: z.string().min(1, "step_type requis"),
  severity:  z.enum(SEVERITIES),
  condition: z.record(z.unknown()),
  action:    z.record(z.unknown()),
  active:    z.boolean().default(true),
});

const PatchRuleSchema = z.object({
  name:      z.string().min(1).optional(),
  scope:     z.enum(SCOPES).optional(),
  step_type: z.string().min(1).optional(),
  severity:  z.enum(SEVERITIES).optional(),
  condition: z.record(z.unknown()).optional(),
  action:    z.record(z.unknown()).optional(),
  active:    z.boolean().optional(),
});

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (request.jwtUser.role !== "admin") {
    await reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Réservé aux administrateurs",
    });
    return false;
  }
  return true;
}

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
  // POST /api/rules  (admin)
  // --------------------------------------------------------------------------
  fastify.post("/api/rules", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;

    const parsed = CreateRuleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: parsed.error.issues[0]?.message ?? "Payload invalide",
        details: parsed.error.flatten(),
      });
    }

    const rule = await prisma.anomalyRule.create({
      data: {
        ...parsed.data,
        condition: parsed.data.condition as Prisma.InputJsonValue,
        action:    parsed.data.action    as Prisma.InputJsonValue,
      },
    });
    return reply.code(201).send({ rule });
  });

  // --------------------------------------------------------------------------
  // PATCH /api/rules/:id  (admin — rétro-compatible toggle)
  // --------------------------------------------------------------------------
  fastify.patch<{ Params: { id: string } }>(
    "/api/rules/:id",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { id } = request.params;

      const parsed = PatchRuleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: "Payload invalide",
          details: parsed.error.flatten(),
        });
      }

      const existing = await prisma.anomalyRule.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Règle introuvable",
        });
      }

      const { condition, action, ...rest } = parsed.data;
      const updated = await prisma.anomalyRule.update({
        where: { id },
        data: {
          ...rest,
          ...(condition !== undefined ? { condition: condition as Prisma.InputJsonValue } : {}),
          ...(action    !== undefined ? { action:    action    as Prisma.InputJsonValue } : {}),
        },
      });
      return reply.send({ rule: updated });
    }
  );

  // --------------------------------------------------------------------------
  // DELETE /api/rules/:id  (admin)
  // --------------------------------------------------------------------------
  fastify.delete<{ Params: { id: string } }>(
    "/api/rules/:id",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;

      const { id } = request.params;

      const rule = await prisma.anomalyRule.findUnique({
        where: { id },
        select: { id: true, _count: { select: { notifications: true } } },
      });
      if (!rule) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Règle introuvable",
        });
      }

      if (rule._count.notifications > 0) {
        return reply.code(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Cette règle a déclenché des alertes et ne peut pas être supprimée",
        });
      }

      await prisma.anomalyRule.delete({ where: { id } });
      return reply.code(204).send();
    }
  );
};
