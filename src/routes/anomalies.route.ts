import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// Routes publiques — Anomalies (Notifications)
// GET  /api/anomalies              — liste des 30 derniers jours (status=sent)
// POST /api/anomalies/:id/acknowledge — acquittement
// =============================================================================

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const AcknowledgeBodySchema = z.object({
  acknowledged_by: z.string().min(1, "acknowledged_by requis"),
  comment: z.string().optional(),
});

export const anomaliesRoute: FastifyPluginAsync = async (fastify) => {
  // --------------------------------------------------------------------------
  // GET /api/anomalies
  // --------------------------------------------------------------------------
  fastify.get("/api/anomalies", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const since = new Date(Date.now() - THIRTY_DAYS_MS);

    const statusFilter = query.status ?? "sent";

    const notifications = await prisma.notification.findMany({
      where: {
        status: statusFilter as "pending" | "sent" | "failed",
        sent_at: { gte: since },
        ...(query.severity
          ? { rule: { severity: query.severity as "warning" | "critical" } }
          : {}),
      },
      include: {
        rule: { select: { id: true, name: true, severity: true, scope: true } },
        project: {
          select: {
            id: true,
            customer_id: true,
            project_type: true,
            status: true,
          },
        },
        event: {
          select: {
            id: true,
            event_type: true,
            acknowledged_by: true,
            created_at: true,
          },
        },
      },
      orderBy: { sent_at: "desc" },
    });

    return reply.send({ anomalies: notifications });
  });

  // --------------------------------------------------------------------------
  // POST /api/anomalies/:id/acknowledge
  // --------------------------------------------------------------------------
  fastify.post<{ Params: { id: string } }>(
    "/api/anomalies/:id/acknowledge",
    async (request, reply) => {
      const { id } = request.params;

      const bodyResult = AcknowledgeBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: "Payload invalide",
          details: bodyResult.error.flatten(),
        });
      }

      const notification = await prisma.notification.findUnique({
        where: { id },
        select: { id: true, event_id: true, status: true },
      });

      if (!notification) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Notification introuvable",
        });
      }

      if (notification.event_id) {
        await prisma.event.update({
          where: { id: notification.event_id },
          data: { acknowledged_by: bodyResult.data.acknowledged_by },
        });
      }

      return reply.send({
        acknowledged: true,
        notification_id: id,
        acknowledged_by: bodyResult.data.acknowledged_by,
      });
    }
  );
};
