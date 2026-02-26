import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// Routes — Recherche globale (Sprint 17)
// GET /api/search?q=<term>&limit=5
// Recherche multi-entité : projets, clients, règles
// q minimum 2 caractères
// =============================================================================

const SearchQuerySchema = z.object({
  q:     z.string().min(2, "q doit contenir au moins 2 caractères"),
  limit: z.coerce.number().min(1).max(10).default(5),
});

export interface SearchResult {
  type:      "project" | "customer" | "rule";
  id:        string;
  label:     string;
  sublabel?: string;
  path:      string;
}

export const searchRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/search", async (request, reply) => {
    const parseResult = SearchQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.code(422).send({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: parseResult.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const { q, limit } = parseResult.data;

    // Requêtes parallèles sur les 3 catégories
    const [projects, customerGroups, rules] = await Promise.all([
      // Projets : customer_id ou store_id contient q
      prisma.project.findMany({
        where: {
          OR: [
            { customer_id: { contains: q, mode: "insensitive" } },
            { store_id:    { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, customer_id: true, project_type: true, status: true },
        orderBy: { created_at: "desc" },
        take: limit,
      }),

      // Clients : customer_ids distincts contenant q
      prisma.project.findMany({
        where: { customer_id: { contains: q, mode: "insensitive" } },
        select: { customer_id: true },
        distinct: ["customer_id"],
        take: limit,
      }),

      // Règles : name contient q
      prisma.anomalyRule.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true, scope: true, severity: true },
        take: limit,
      }),
    ]);

    const PROJECT_TYPE: Record<string, string> = {
      kitchen:            "Cuisine",
      bathroom:           "Salle de bain",
      energy_renovation:  "Rénovation énergétique",
      other:              "Autre",
    };

    const PROJECT_STATUS: Record<string, string> = {
      draft:     "Brouillon",
      active:    "Actif",
      on_hold:   "En pause",
      completed: "Terminé",
      cancelled: "Annulé",
    };

    const results: SearchResult[] = [
      ...projects.map((p) => ({
        type:     "project" as const,
        id:       p.id,
        label:    p.customer_id,
        sublabel: `${PROJECT_TYPE[p.project_type] ?? p.project_type} · ${PROJECT_STATUS[p.status] ?? p.status}`,
        path:     `/projects/${p.id}`,
      })),
      ...customerGroups.map((c) => ({
        type:  "customer" as const,
        id:    c.customer_id,
        label: c.customer_id,
        path:  `/customers/${encodeURIComponent(c.customer_id)}`,
      })),
      ...rules.map((r) => ({
        type:     "rule" as const,
        id:       r.id,
        label:    r.name,
        sublabel: `${r.scope} · ${r.severity}`,
        path:     `/rules`,
      })),
    ];

    return reply.send({ results, query: q });
  });
};
