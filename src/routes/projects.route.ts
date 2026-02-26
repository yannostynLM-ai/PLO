import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import type { ProjectStatus, ProjectType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logActivity } from "../lib/activity.js";

// =============================================================================
// Routes — Projets (Sprint 15 : PATCH + notes ajoutés)
// POST   /api/projects                               — créer un projet
// GET    /api/projects                               — liste avec sévérité anomalie calculée
// GET    /api/projects/export.csv                   — export CSV (mêmes filtres)
// PATCH  /api/projects/:id                          — mise à jour statut / magasin
// POST   /api/projects/:id/notes                    — ajouter une note opérateur
// POST   /api/projects/:id/partial-delivery-approval — valider livraison partielle (Sprint 20)
// GET    /api/projects/:id                          — détail complet (inclut notes)
// =============================================================================

const CreateProjectSchema = z.object({
  customer_id:    z.string().min(1, "customer_id requis"),
  project_type:   z.enum(["kitchen", "bathroom", "energy_renovation", "other"]),
  channel_origin: z.enum(["store", "web", "mixed"]).default("store"),
  store_id:       z.string().optional(),
  status:         z.enum(["draft", "active", "on_hold", "completed", "cancelled"]).default("draft"),
});

const PatchProjectSchema = z.object({
  status:      z.enum(["draft", "active", "on_hold", "completed", "cancelled"]).optional(),
  store_id:    z.string().nullable().optional(),
  assigned_to: z.string().nullable().optional(),   // Sprint 18
});

const CreateNoteSchema = z.object({
  content:     z.string().min(1, "content requis"),
  author_name: z.string().min(1, "author_name requis"),
});

const PartialDeliveryApprovalSchema = z.object({
  approved_by: z.string().min(1, "approved_by requis"),
  notes:       z.string().optional(),
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

const ProjectsQuerySchema = z.object({
  q:        z.string().optional(),
  status:   z.string().optional(),
  severity: z.enum(["ok", "warning", "critical"]).optional(),
  type:     z.string().optional(),
  store:    z.string().optional(),
  assignee: z.string().optional(),   // Sprint 18
  page:     z.coerce.number().int().min(1).default(1),    // Sprint 19
  limit:    z.coerce.number().int().min(1).max(100).default(20), // Sprint 19
});

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function sevenDaysAgo(): Date {
  return new Date(Date.now() - SEVEN_DAYS_MS);
}

export const projectsRoute: FastifyPluginAsync = async (fastify) => {
  // --------------------------------------------------------------------------
  // POST /api/projects
  // --------------------------------------------------------------------------
  fastify.post("/api/projects", async (request, reply) => {
    const parsed = CreateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: parsed.error.issues[0]?.message ?? "Payload invalide",
        details: parsed.error.flatten(),
      });
    }
    const project = await prisma.project.create({
      data: {
        ...parsed.data,
        tracking_token: randomUUID(),
      },
    });

    logActivity({
      action:        "project_created",
      entity_type:   "project",
      entity_id:     project.id,
      entity_label:  project.customer_id,
      operator_name: request.jwtUser.name,
    });

    return reply.code(201).send({ project });
  });

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
    const { q, status, severity, type, store, assignee } = parseResult.data;

    const where = {
      ...(q        ? { customer_id:  { contains: q,       mode: "insensitive" as const } } : {}),
      ...(status   ? { status:       status as ProjectStatus  } : {}),
      ...(type     ? { project_type: type   as ProjectType    } : {}),
      ...(store    ? { store_id:     { contains: store,   mode: "insensitive" as const } } : {}),
      ...(assignee ? { assigned_to:  { contains: assignee, mode: "insensitive" as const } } : {}),
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
        assigned_to: project.assigned_to,   // Sprint 18
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

    // Sprint 19 — pagination JS (après sort sur anomaly_severity calculée en JS)
    const { page, limit } = parseResult.data;
    const total = finalResult.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);
    const paginatedResult = finalResult.slice((safePage - 1) * limit, safePage * limit);

    return reply.send({ projects: paginatedResult, total, page: safePage, limit, pages });
  });

  // --------------------------------------------------------------------------
  // GET /api/projects/export.csv
  // Route statique → priorité sur /:id (comportement Fastify garanti)
  // --------------------------------------------------------------------------
  fastify.get("/api/projects/export.csv", async (request, reply) => {
    const parseResult = ProjectsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: parseResult.error.issues[0]?.message ?? "Invalid query params",
      });
    }
    const { q, status, severity, type, store, assignee } = parseResult.data;

    const where = {
      ...(q        ? { customer_id:  { contains: q,       mode: "insensitive" as const } } : {}),
      ...(status   ? { status:       status as ProjectStatus  } : {}),
      ...(type     ? { project_type: type   as ProjectType    } : {}),
      ...(store    ? { store_id:     { contains: store,   mode: "insensitive" as const } } : {}),
      ...(assignee ? { assigned_to:  { contains: assignee, mode: "insensitive" as const } } : {}),
    };

    const since = sevenDaysAgo();
    const projects = await prisma.project.findMany({
      where,
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

    const result = projects.map((project) => {
      const notifs = project.notifications;
      let anomaly_severity: "ok" | "warning" | "critical" = "ok";
      if (notifs.some((n) => n.rule?.severity === "critical")) anomaly_severity = "critical";
      else if (notifs.some((n) => n.rule?.severity === "warning")) anomaly_severity = "warning";
      const unacked = notifs.filter((n) => !n.event?.acknowledged_by);
      return {
        customer_id: project.customer_id,
        project_type: project.project_type,
        status: project.status,
        channel_origin: project.channel_origin,
        store_id: project.store_id,
        assigned_to: project.assigned_to,   // Sprint 18
        created_at: project.created_at,
        anomaly_severity,
        active_anomaly_count: unacked.length,
        last_event_at: project.events[0]?.created_at ?? null,
      };
    });

    const filtered = severity ? result.filter((p) => p.anomaly_severity === severity) : result;

    const header = toCsvRow([
      "Client", "Type", "Statut", "Canal", "Magasin", "Responsable",
      "Sévérité", "Anomalies actives", "Dernier événement", "Créé le",
    ]);
    const rows = filtered.map((p) =>
      toCsvRow([
        p.customer_id, p.project_type, p.status, p.channel_origin, p.store_id ?? "",
        p.assigned_to ?? "",
        p.anomaly_severity, p.active_anomaly_count,
        p.last_event_at?.toISOString() ?? "",
        p.created_at.toISOString(),
      ])
    );

    const csv = [header, ...rows].join("\n");
    const filename = `projets-${new Date().toISOString().slice(0, 10)}.csv`;

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(csv);
  });

  // --------------------------------------------------------------------------
  // PATCH /api/projects/:id  — mise à jour statut / magasin
  // --------------------------------------------------------------------------
  fastify.patch<{ Params: { id: string } }>(
    "/api/projects/:id",
    async (request, reply) => {
      const { id } = request.params;

      const parsed = PatchProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: parsed.error.issues[0]?.message ?? "Payload invalide",
          details: parsed.error.flatten(),
        });
      }

      const existing = await prisma.project.findUnique({
        where: { id },
        select: { id: true, status: true, customer_id: true, assigned_to: true },
      });
      if (!existing) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Projet introuvable",
        });
      }

      const project = await prisma.project.update({
        where: { id },
        data: parsed.data,
        select: { id: true, status: true, store_id: true, assigned_to: true, updated_at: true },
      });

      if (parsed.data.status && parsed.data.status !== existing.status) {
        logActivity({
          action:        "project_status_changed",
          entity_type:   "project",
          entity_id:     id,
          entity_label:  existing.customer_id,
          operator_name: request.jwtUser.name,
          details:       { from: existing.status, to: parsed.data.status },
        });
      }

      if (parsed.data.assigned_to !== undefined && parsed.data.assigned_to !== existing.assigned_to) {
        logActivity({
          action:        "project_assigned",
          entity_type:   "project",
          entity_id:     id,
          entity_label:  existing.customer_id,
          operator_name: request.jwtUser.name,
          details:       { from: existing.assigned_to ?? null, to: parsed.data.assigned_to ?? null },
        });
      }

      return reply.send({ project });
    }
  );

  // --------------------------------------------------------------------------
  // POST /api/projects/:id/notes  — ajouter une note opérateur
  // --------------------------------------------------------------------------
  fastify.post<{ Params: { id: string } }>(
    "/api/projects/:id/notes",
    async (request, reply) => {
      const { id } = request.params;

      const parsed = CreateNoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: parsed.error.issues[0]?.message ?? "Payload invalide",
          details: parsed.error.flatten(),
        });
      }

      const project = await prisma.project.findUnique({
        where: { id },
        select: { id: true, customer_id: true },
      });
      if (!project) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Projet introuvable",
        });
      }

      const note = await prisma.projectNote.create({
        data: { project_id: id, ...parsed.data },
      });

      logActivity({
        action:        "project_note_added",
        entity_type:   "project",
        entity_id:     id,
        entity_label:  project.customer_id,
        operator_name: parsed.data.author_name,
      });

      return reply.code(201).send({ note });
    }
  );

  // --------------------------------------------------------------------------
  // POST /api/projects/:id/partial-delivery-approval  (Sprint 20 — Q11)
  // Double canal : UI opérateur + événement OMS externe (déjà géré via entity.service)
  // --------------------------------------------------------------------------
  fastify.post<{ Params: { id: string } }>(
    "/api/projects/:id/partial-delivery-approval",
    async (request, reply) => {
      const { id } = request.params;

      const parsed = PartialDeliveryApprovalSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: parsed.error.issues[0]?.message ?? "Payload invalide",
          details: parsed.error.flatten(),
        });
      }

      const { approved_by, notes } = parsed.data;

      const [project, consolidation] = await Promise.all([
        prisma.project.findUnique({ where: { id }, select: { customer_id: true } }),
        prisma.consolidation.findUnique({ where: { project_id: id } }),
      ]);

      if (!project) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Projet introuvable",
        });
      }
      if (!consolidation) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Aucune consolidation pour ce projet",
        });
      }
      if (consolidation.partial_delivery_approved) {
        return reply.code(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Livraison partielle déjà approuvée",
        });
      }

      const updated = await prisma.consolidation.update({
        where: { id: consolidation.id },
        data: {
          status:                    "partial_approved",
          partial_delivery_approved: true,
          partial_approved_by: {
            customer:             true,
            installer:            true,
            approved_at:          new Date().toISOString(),
            approved_by_operator: approved_by,
            ...(notes ? { notes } : {}),
          },
          updated_at: new Date(),
        },
      });

      logActivity({
        action:        "partial_delivery_approved",
        entity_type:   "project",
        entity_id:     id,
        entity_label:  project.customer_id,
        operator_name: approved_by,
      });

      return reply.send({
        approved:        true,
        consolidation_id: updated.id,
        approved_by,
      });
    }
  );

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
          notes: {
            orderBy: { created_at: "desc" },
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
