// =============================================================================
// PLO — Route analyse de risque IA (Sprint 8)
// GET /api/projects/:id/risk-analysis
// =============================================================================

import type { FastifyPluginAsync } from "fastify";
import { analyzeProjectRisk } from "../services/risk-analysis.service.js";

export const riskRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { id: string } }>(
    "/api/projects/:id/risk-analysis",
    async (request, reply) => {
      const { id } = request.params;

      const analysis = await analyzeProjectRisk(id);

      if (!analysis) {
        return reply.notFound(`Project ${id} not found`);
      }

      return reply.send(analysis);
    },
  );
};
