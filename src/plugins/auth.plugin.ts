import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import type { EventSource } from "@prisma/client";
import { config } from "../config.js";

// =============================================================================
// Plugin d'authentification — Bearer token par source
// =============================================================================

// Augmentation du type FastifyRequest pour exposer la source authentifiée
declare module "fastify" {
  interface FastifyRequest {
    authenticatedSource: EventSource | null;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Décore chaque request avec un champ authenticatedSource (null par défaut)
  fastify.decorateRequest("authenticatedSource", null);

  fastify.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Authorization header manquant ou invalide (attendu: Bearer <token>)",
      });
    }

    const token = authHeader.slice(7).trim();
    const source = (config.API_KEYS as Record<string, EventSource>)[token];

    if (!source) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "API key invalide",
      });
    }

    request.authenticatedSource = source;
  });
};

export default fp(authPlugin, {
  name: "plo-auth",
  fastify: "5.x",
});
