import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// Routes — Clients (Vue Client)
// GET /api/customers          — liste des clients distincts avec stats agrégées
// GET /api/customers/:id      — détail client + tous ses projets
// =============================================================================

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function sevenDaysAgo(): Date {
  return new Date(Date.now() - SEVEN_DAYS_MS);
}

const severityOrder = { critical: 2, warning: 1, ok: 0 } as const;

type Severity = "ok" | "warning" | "critical";

function projectSeverity(notifs: Array<{ rule: { severity: string } | null; event: { acknowledged_by: string | null } | null }>): Severity {
  if (notifs.some((n) => n.rule?.severity === "critical")) return "critical";
  if (notifs.some((n) => n.rule?.severity === "warning")) return "warning";
  return "ok";
}

/** Reprend la même logique que projects.route.ts pour construire un ProjectSummary. */
function buildProjectSummary(project: {
  id: string;
  customer_id: string;
  project_type: string;
  status: string;
  channel_origin: string;
  store_id: string | null;
  created_at: Date;
  updated_at: Date;
  notifications: Array<{
    sent_at: Date | null;
    rule: { severity: string } | null;
    event: { acknowledged_by: string | null; created_at: Date } | null;
  }>;
  events: Array<{ created_at: Date }>;
}) {
  const notifs = project.notifications;
  const anomaly_severity = projectSeverity(notifs);
  const unacked = notifs.filter((n) => !n.event?.acknowledged_by);
  const oldest_unack_anomaly_at = unacked.length > 0 ? unacked[0].sent_at : null;

  return {
    project_id: project.id,
    customer_id: project.customer_id,
    project_type: project.project_type,
    status: project.status,
    channel_origin: project.channel_origin,
    store_id: project.store_id,
    created_at: project.created_at,
    updated_at: project.updated_at,
    anomaly_severity,
    active_anomaly_count: unacked.length,
    oldest_unack_anomaly_at,
    last_event_at: project.events[0]?.created_at ?? null,
  };
}

const CustomersQuerySchema = z.object({
  q: z.string().optional(),
});

export const customersRoute: FastifyPluginAsync = async (fastify) => {
  // --------------------------------------------------------------------------
  // GET /api/customers
  // --------------------------------------------------------------------------
  fastify.get("/api/customers", async (request, reply) => {
    const parseResult = CustomersQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: parseResult.error.issues[0]?.message ?? "Invalid query params",
      });
    }
    const { q } = parseResult.data;
    const since = sevenDaysAgo();

    const projects = await prisma.project.findMany({
      where: q ? { customer_id: { contains: q, mode: "insensitive" } } : {},
      include: {
        notifications: {
          where: { status: "sent", sent_at: { gte: since } },
          include: {
            rule: { select: { severity: true } },
            event: { select: { acknowledged_by: true } },
          },
          orderBy: { sent_at: "asc" },
        },
        events: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: { created_at: true },
        },
      },
      orderBy: { customer_id: "asc" },
    });

    // Grouper par customer_id
    const customerMap = new Map<string, {
      customer_id: string;
      project_count: number;
      active_project_count: number;
      anomaly_severity: Severity;
      active_anomaly_count: number;
      last_event_at: Date | null;
    }>();

    for (const project of projects) {
      const severity = projectSeverity(project.notifications);
      const unacked = project.notifications.filter((n) => !n.event?.acknowledged_by);
      const isActive = !["completed", "cancelled"].includes(project.status);
      const lastEventAt = project.events[0]?.created_at ?? null;

      const existing = customerMap.get(project.customer_id);
      if (!existing) {
        customerMap.set(project.customer_id, {
          customer_id: project.customer_id,
          project_count: 1,
          active_project_count: isActive ? 1 : 0,
          anomaly_severity: severity,
          active_anomaly_count: unacked.length,
          last_event_at: lastEventAt,
        });
      } else {
        existing.project_count++;
        if (isActive) existing.active_project_count++;
        if (severityOrder[severity] > severityOrder[existing.anomaly_severity]) {
          existing.anomaly_severity = severity;
        }
        existing.active_anomaly_count += unacked.length;
        if (lastEventAt && (!existing.last_event_at || lastEventAt > existing.last_event_at)) {
          existing.last_event_at = lastEventAt;
        }
      }
    }

    // Tri : sévérité desc, puis anomalies actives desc, puis customer_id asc
    const customers = [...customerMap.values()].sort((a, b) => {
      const sa = severityOrder[a.anomaly_severity];
      const sb = severityOrder[b.anomaly_severity];
      if (sa !== sb) return sb - sa;
      if (a.active_anomaly_count !== b.active_anomaly_count) {
        return b.active_anomaly_count - a.active_anomaly_count;
      }
      return a.customer_id.localeCompare(b.customer_id);
    });

    return reply.send({ customers });
  });

  // --------------------------------------------------------------------------
  // GET /api/customers/:customerId
  // --------------------------------------------------------------------------
  fastify.get<{ Params: { customerId: string } }>(
    "/api/customers/:customerId",
    async (request, reply) => {
      const { customerId } = request.params;
      const since = sevenDaysAgo();

      const projects = await prisma.project.findMany({
        where: { customer_id: customerId },
        include: {
          notifications: {
            where: { status: "sent", sent_at: { gte: since } },
            include: {
              rule: { select: { severity: true } },
              event: { select: { acknowledged_by: true, created_at: true } },
            },
            orderBy: { sent_at: "asc" },
          },
          events: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { created_at: true },
          },
        },
        orderBy: { created_at: "desc" },
      });

      if (projects.length === 0) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Client introuvable",
        });
      }

      const result = projects.map(buildProjectSummary);

      // Sort projects by severity then oldest anomaly
      result.sort((a, b) => {
        const sa = severityOrder[a.anomaly_severity];
        const sb = severityOrder[b.anomaly_severity];
        if (sa !== sb) return sb - sa;
        if (a.oldest_unack_anomaly_at && b.oldest_unack_anomaly_at) {
          return new Date(a.oldest_unack_anomaly_at).getTime() - new Date(b.oldest_unack_anomaly_at).getTime();
        }
        if (a.oldest_unack_anomaly_at) return -1;
        if (b.oldest_unack_anomaly_at) return 1;
        return 0;
      });

      // Aggregate stats
      let anomaly_severity: Severity = "ok";
      for (const p of result) {
        if (severityOrder[p.anomaly_severity] > severityOrder[anomaly_severity]) {
          anomaly_severity = p.anomaly_severity;
        }
      }
      const active_project_count = result.filter(
        (p) => !["completed", "cancelled"].includes(p.status)
      ).length;
      const active_anomaly_count = result.reduce((s, p) => s + p.active_anomaly_count, 0);

      return reply.send({
        customer_id: customerId,
        projects: result,
        stats: {
          project_count: result.length,
          active_project_count,
          anomaly_severity,
          active_anomaly_count,
        },
      });
    }
  );
};
