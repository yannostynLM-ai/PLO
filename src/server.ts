import Fastify from "fastify";
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import authPlugin from "./plugins/auth.plugin.js";
import jwtAuthPlugin from "./plugins/jwt-auth.plugin.js";
import { authRoute } from "./routes/auth.route.js";
import { ingestRoute } from "./routes/ingest.route.js";
import { projectsRoute } from "./routes/projects.route.js";
import { anomaliesRoute } from "./routes/anomalies.route.js";
import { rulesRoute } from "./routes/rules.route.js";
import { statsRoute } from "./routes/stats.route.js";
import { trackingRoute } from "./routes/tracking.route.js";
import { installerRoute } from "./routes/installer.route.js";
import { riskRoute } from "./routes/risk.route.js";
import { usersRoute } from "./routes/users.route.js";
import { sseRoute } from "./routes/sse.route.js";
import { customersRoute } from "./routes/customers.route.js";
import { activityRoute } from "./routes/activity.route.js";
import { searchRoute } from "./routes/search.route.js";
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

  // ── Plugins globaux ────────────────────────────────────────────────────────
  await fastify.register(sensible);
  await fastify.register(cors, { origin: true });

  // @fastify/cookie et @fastify/jwt enregistrés globalement :
  // - authRoute les utilise pour signer le token et poser le cookie
  // - jwtAuthPlugin les utilise pour lire et vérifier le cookie
  await fastify.register(cookie);
  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
    cookie: {
      cookieName: "plo_session",
      signed: false,
    },
  });

  // ── Health check — public ──────────────────────────────────────────────────
  fastify.get("/health", async () => ({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  }));

  // ── Routes publiques — sans authentification ───────────────────────────────
  // Portail client suivi (token URL) — reste 100% public
  await fastify.register(trackingRoute);
  // Portail installateur (token URL) — Sprint 22
  await fastify.register(installerRoute);

  // Login / logout / me
  await fastify.register(authRoute);

  // ── Scope opérateur — protégé par JWT cookie ───────────────────────────────
  await fastify.register(async (operatorScope) => {
    await operatorScope.register(jwtAuthPlugin);
    await operatorScope.register(projectsRoute);
    await operatorScope.register(anomaliesRoute);
    await operatorScope.register(rulesRoute);
    await operatorScope.register(statsRoute);
    await operatorScope.register(riskRoute);
    await operatorScope.register(usersRoute);
    await operatorScope.register(sseRoute);
    await operatorScope.register(customersRoute);
    await operatorScope.register(activityRoute);
    await operatorScope.register(searchRoute);
  });

  // ── Scope ingest — protégé par Bearer per-source (inchangé) ───────────────
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
