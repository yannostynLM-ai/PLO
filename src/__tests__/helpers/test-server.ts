// =============================================================================
// Test server — Fastify build + JWT login helper pour tests d'intégration
// =============================================================================

import { buildServer } from "../../server.js";
import type { FastifyInstance } from "fastify";

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildServer();
  await app.ready();
  return app;
}

/**
 * Login as admin and return the plo_session cookie string for inject().
 */
export async function loginAsAdmin(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "admin@plo.local",
      password: "admin-password",
    },
  });

  const cookies = res.cookies as Array<{ name: string; value: string }>;
  const session = cookies.find((c) => c.name === "plo_session");
  if (!session) {
    throw new Error("Login failed — no plo_session cookie returned");
  }
  return `plo_session=${session.value}`;
}
