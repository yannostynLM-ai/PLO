import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ProjectStatus, ProjectType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// Routes publiques — Projets
// GET /api/projects       — liste avec sévérité anomalie calculée
// GET /api/projects/:id   — détail complet
// =============================================================================

const ProjectsQuerySchema = z.object({
  q:        z.string().optional(),
  status:   z.string().optional(),
  severity: z.enum(["ok", "warning", "critical"]).optional(),
  type:     z.string().optional(),
  store:    z.string().optional(),
});

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function sevenDaysAgo(): Date {
  return new Date(Date.now() - SEVEN_DAYS_MS);
}

export const projectsRoute: FastifyPluginAsync = async (fastify) => {
  // --------------------------------------------------------------------------
  // GET /api/projects
  // --------------------------------------------------------------------------
  fastify.get("/api/projects", async (request, reply) => {
    const parseResult = ProjectsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: parseResult.error.issues[0]?.message ?? "Invalid query params",
      });
    }
    const { q, status, severity, type, store } = parseResult.data;

    const where = {
      ...(q      ? { customer_id:  { contains: q,     mode: "insensitive" as const } } : {}),
      ...(status ? { status:       status as ProjectStatus  } : {}),
      ...(type   ? { project_type: type   as ProjectType    } : {}),
      ...(store  ? { store_id:     { contains: store, mode: "insensitive" as const } } : {}),
    };

    const since = sevenDaysAgo();

    const projects = await prisma.project.findMany({
      where,
      include: {
        notifications: {
          where: {
            status: "sent",
            sent_at: { gte: since },
          },
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

    const result = projects.map((project) => {
      const notifs = project.notifications;

      // Calcul sévérité
      let anomaly_severity: "ok" | "warning" | "critical" = "ok";
      if (notifs.some((n) => n.rule?.severity === "critical")) {
        anomaly_severity = "critical";
      } else if (notifs.some((n) => n.rule?.severity === "warning")) {
        anomaly_severity = "warning";
      }

      // Anomalies non acquittées = event.acknowledged_by est null
      const unacked = notifs.filter((n) => !n.event?.acknowledged_by);
      const oldest_unack_anomaly_at =
        unacked.length > 0 ? unacked[0].sent_at : null;

      const active_anomaly_count = unacked.length;
      const last_event_at = project.events[0]?.created_at ?? null;

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
        active_anomaly_count,
        oldest_unack_anomaly_at,
        last_event_at,
      };
    });

    // Tri : anomalies non acquittées les plus anciennes en premier
    result.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, ok: 2 } as const;
      const sa = severityOrder[a.anomaly_severity];
      const sb = severityOrder[b.anomaly_severity];
      if (sa !== sb) return sa - sb;
      if (a.oldest_unack_anomaly_at && b.oldest_unack_anomaly_at) {
        return (
          a.oldest_unack_anomaly_at.getTime() -
          b.oldest_unack_anomaly_at.getTime()
        );
      }
      if (a.oldest_unack_anomaly_at) return -1;
      if (b.oldest_unack_anomaly_at) return 1;
      return 0;
    });

    const finalResult = severity
      ? result.filter((p) => p.anomaly_severity === severity)
      : result;

    return reply.send({ projects: finalResult });
  });

  // --------------------------------------------------------------------------
  // GET /api/projects/:id
  // --------------------------------------------------------------------------
  fastify.get<{ Params: { id: string } }>(
    "/api/projects/:id",
    async (request, reply) => {
      const { id } = request.params;

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          external_refs: true,
          orders: {
            include: {
              lines: true,
              shipments: true,
              steps: {
                include: {
                  events: { orderBy: { created_at: "desc" } },
                },
                orderBy: { created_at: "asc" },
              },
              events: { orderBy: { created_at: "desc" }, take: 20 },
            },
          },
          consolidation: true,
          last_mile: true,
          installation: {
            include: {
              steps: {
                include: {
                  events: { orderBy: { created_at: "desc" } },
                },
                orderBy: { created_at: "asc" },
              },
              events: { orderBy: { created_at: "desc" }, take: 20 },
            },
          },
          steps: {
            include: {
              events: { orderBy: { created_at: "desc" } },
            },
            orderBy: { created_at: "asc" },
          },
          events: {
            orderBy: { created_at: "desc" },
            take: 50,
          },
          notifications: {
            where: { status: "sent" },
            include: {
              rule: { select: { id: true, name: true, severity: true } },
              event: { select: { id: true, event_type: true, acknowledged_by: true } },
            },
            orderBy: { sent_at: "desc" },
            take: 30,
          },
        },
      });

      if (!project) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Projet introuvable",
        });
      }

      return reply.send({ project });
    }
  );
};
