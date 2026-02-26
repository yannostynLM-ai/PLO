import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { registerSseClient, unregisterSseClient } from "../services/sse.service.js";

// =============================================================================
// Route SSE — GET /api/sse/notifications
// Protégée par JWT cookie (scope operatorScope)
// =============================================================================

export const sseRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/sse/notifications", async (request, reply) => {
    const clientId = randomUUID();

    // Fastify 5 : prendre contrôle du flux avant writeHead
    reply.hijack();
    const res = reply.raw;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\n");

    registerSseClient(clientId, res, request.jwtUser.id);

    const keepAlive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(keepAlive);
        unregisterSseClient(clientId);
      }
    }, 20_000);

    request.raw.on("close", () => {
      clearInterval(keepAlive);
      unregisterSseClient(clientId);
    });
    // Pas de retour après hijack
  });
};
