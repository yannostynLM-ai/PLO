import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { logActivity } from "../lib/activity.js";

// =============================================================================
// Routes — Anomalies (Notifications)
// GET  /api/anomalies                  — liste filtrée (30j par défaut)
// GET  /api/anomalies/export.csv       — export CSV (mêmes filtres)
// POST /api/anomalies/:id/acknowledge  — acquittement unitaire
// POST /api/anomalies/bulk-acknowledge — acquittement en masse
// =============================================================================

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const AnomaliesQuerySchema = z.object({
  status:      z.string().optional(),
  severity:    z.enum(["warning", "critical"]).optional(),
  from:        z.string().optional(),
  to:          z.string().optional(),
  customer_id: z.string().optional(),
  rule_name:   z.string().optional(),
  page:        z.coerce.number().int().min(1).default(1),    // Sprint 19
  limit:       z.coerce.number().int().min(1).max(100).default(20), // Sprint 19
});

const AcknowledgeBodySchema = z.object({
  acknowledged_by: z.string().min(1, "acknowledged_by requis"),
  comment: z.string().optional(),
});

const BulkAcknowledgeBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  acknowledged_by: z.string().min(1, "acknowledged_by requis"),
  comment: z.string().optional(),
});

// Helper CSV — échappe les virgules et guillemets
function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(",");
}

/** Construit le where Prisma à partir des query params parsés. */
function buildWhere(params: z.infer<typeof AnomaliesQuerySchema>) {
  const { status, severity, from, to, customer_id, rule_name } = params;

  const statusFilter = status ?? "sent";
  const dateGte = from ? new Date(from) : new Date(Date.now() - THIRTY_DAYS_MS);
  const dateLte = to ? new Date(to) : undefined;

  const ruleFilter = {
    ...(severity  ? { severity }                                                          : {}),
    ...(rule_name ? { name: { contains: rule_name, mode: "insensitive" as const } }      : {}),
  };

  return {
    status: statusFilter as "pending" | "sent" | "failed",
    sent_at: { gte: dateGte, ...(dateLte ? { lte: dateLte } : {}) },
    ...(Object.keys(ruleFilter).length > 0 ? { rule: ruleFilter } : {}),
    ...(customer_id
      ? { project: { customer_id: { contains: customer_id, mode: "insensitive" as const } } }
      : {}),
  };
}

export const anomaliesRoute: FastifyPluginAsync = async (fastify) => {
  // --------------------------------------------------------------------------
  // GET /api/anomalies
  // --------------------------------------------------------------------------
  fastify.get("/api/anomalies", async (request, reply) => {
    const parseResult = AnomaliesQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: parseResult.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    // Sprint 19 — vraie pagination DB (sort SQL, skip/take + count parallèle)
    const { page, limit } = parseResult.data;
    const skip = (page - 1) * limit;
    const where = buildWhere(parseResult.data);

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          rule: { select: { id: true, name: true, severity: true, scope: true } },
          project: { select: { id: true, customer_id: true, project_type: true, status: true } },
          event: { select: { id: true, event_type: true, acknowledged_by: true, created_at: true } },
        },
        orderBy: { sent_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));
    return reply.send({ anomalies: notifications, total, page, limit, pages });
  });

  // --------------------------------------------------------------------------
  // GET /api/anomalies/export.csv
  // Route statique → priorité sur /:id (comportement Fastify garanti)
  // --------------------------------------------------------------------------
  fastify.get("/api/anomalies/export.csv", async (request, reply) => {
    const parseResult = AnomaliesQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: parseResult.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const notifications = await prisma.notification.findMany({
      where: buildWhere(parseResult.data),
      include: {
        rule: { select: { name: true, severity: true, scope: true } },
        project: { select: { customer_id: true, project_type: true } },
        event: { select: { event_type: true, acknowledged_by: true } },
      },
      orderBy: { sent_at: "desc" },
    });

    const header = toCsvRow([
      "Date envoi", "Sévérité", "Règle", "Scope",
      "Client", "Type projet", "Événement", "Destinataire",
      "Acquitté par", "Escaladé le", "Ticket CRM", "Statut",
    ]);

    const rows = notifications.map((n) =>
      toCsvRow([
        n.sent_at?.toISOString() ?? "",
        n.rule?.severity ?? "",
        n.rule?.name ?? "",
        n.rule?.scope ?? "",
        n.project?.customer_id ?? "",
        n.project?.project_type ?? "",
        n.event?.event_type ?? "",
        n.recipient,
        n.event?.acknowledged_by ?? "",
        n.escalated_at?.toISOString() ?? "",
        n.crm_ticket_ref ?? "",
        n.status,
      ])
    );

    const csv = [header, ...rows].join("\n");
    const filename = `anomalies-${new Date().toISOString().slice(0, 10)}.csv`;

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(csv);
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
        select: {
          id: true,
          event_id: true,
          status: true,
          project: { select: { customer_id: true } },
        },
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

      logActivity({
        action:        "anomaly_acknowledged",
        entity_type:   "anomaly",
        entity_id:     id,
        entity_label:  notification.project?.customer_id ?? undefined,
        operator_name: bodyResult.data.acknowledged_by,
      });

      return reply.send({
        acknowledged: true,
        notification_id: id,
        acknowledged_by: bodyResult.data.acknowledged_by,
      });
    }
  );

  // --------------------------------------------------------------------------
  // POST /api/anomalies/bulk-acknowledge
  // --------------------------------------------------------------------------
  fastify.post("/api/anomalies/bulk-acknowledge", async (request, reply) => {
    const bodyResult = BulkAcknowledgeBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: "Payload invalide",
        details: bodyResult.error.flatten(),
      });
    }

    const { ids, acknowledged_by } = bodyResult.data;

    const notifications = await prisma.notification.findMany({
      where: { id: { in: ids } },
      select: { id: true, event_id: true },
    });

    if (notifications.length === 0) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Aucune notification trouvée",
      });
    }

    const eventIds = notifications
      .map((n) => n.event_id)
      .filter((id): id is string => id !== null);

    if (eventIds.length > 0) {
      await prisma.event.updateMany({
        where: { id: { in: eventIds }, acknowledged_by: null },
        data: { acknowledged_by },
      });
    }

    logActivity({
      action:        "anomaly_bulk_acknowledged",
      entity_type:   "anomaly",
      operator_name: acknowledged_by,
      details:       { count: notifications.length },
    });

    return reply.send({
      acknowledged: notifications.length,
      ids: notifications.map((n) => n.id),
    });
  });
};
