import Fastify from "fastify";
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import authPlugin from "./plugins/auth.plugin.js";
import { ingestRoute } from "./routes/ingest.route.js";
import { projectsRoute } from "./routes/projects.route.js";
import { anomaliesRoute } from "./routes/anomalies.route.js";
import { rulesRoute } from "./routes/rules.route.js";
import { statsRoute } from "./routes/stats.route.js";
import { trackingRoute } from "./routes/tracking.route.js";
import { config } from "./config.js";

// =============================================================================
// Serveur Fastify — PLO API
// =============================================================================

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  // Plugins globaux (sans auth)
  await fastify.register(sensible);
  await fastify.register(cors, { origin: true });

  // Health check — public, sans authentification
  fastify.get("/health", async () => ({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  }));

  // Routes publiques — lecture seule (pas d'auth)
  await fastify.register(projectsRoute);
  await fastify.register(anomaliesRoute);
  await fastify.register(rulesRoute);
  await fastify.register(statsRoute);
  await fastify.register(trackingRoute);

  // Routes protégées — auth Bearer par source
  await fastify.register(async (api) => {
    await api.register(authPlugin);
    await api.register(ingestRoute);
  });

  return fastify;
}

export async function startServer() {
  const fastify = await buildServer();
  await fastify.listen({ port: config.PORT, host: config.HOST });
  return fastify;
}
