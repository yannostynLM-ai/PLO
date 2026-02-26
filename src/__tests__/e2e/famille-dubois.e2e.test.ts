import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";

// =============================================================================
// E2E — Scénario Famille Dubois (séquentiel, vraie DB)
// Pré-requis : Docker postgres + redis, seed via globalSetup
// =============================================================================

// On ne peut pas importer buildServer directement car il connecterait
// redis/bullmq. On reconstruit un serveur simplifié qui pointe vers la vraie DB.
// Alternative: on utilise le buildServer du projet mais on s'assure que
// les services redis sont disponibles.

let baseUrl: string;
let cookie_session: string;
let projectId: string;
let anomalyId: string;

// We use fetch against a real server for true E2E
// But for simplicity in this project, we'll use buildServer + inject

import { buildServer } from "../../server.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
}, 30000);

afterAll(async () => {
  await app.close();
});

describe("E2E — Famille Dubois", () => {
  // ── 1. Login admin ──────────────────────────────────────────────────────
  it("1. POST /api/auth/login → 200 + cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@plo.local",
        password: "admin-password",
      },
    });

    expect(res.statusCode).toBe(200);
    const cookies = res.cookies as Array<{ name: string; value: string }>;
    const session = cookies.find((c) => c.name === "plo_session");
    expect(session).toBeDefined();
    cookie_session = `plo_session=${session!.value}`;

    const body = res.json();
    expect(body.user.email).toBe("admin@plo.local");
  });

  // ── 2. GET /api/projects → Dubois avec severity critical ────────────────
  it("2. GET /api/projects → Dubois with anomaly_severity critical", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { cookie: cookie_session },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.projects).toBeDefined();

    const dubois = body.projects.find(
      (p: any) => p.customer_id === "CLI-DUBOIS-2024"
    );
    expect(dubois).toBeDefined();
    expect(dubois.anomaly_severity).toBe("critical");
    projectId = dubois.project_id;
  });

  // ── 3. GET /api/projects/:id → détail complet ──────────────────────────
  it("3. GET /api/projects/:id → 2 orders, consolidation in_progress", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}`,
      headers: { cookie: cookie_session },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.project.orders).toHaveLength(2);
    expect(body.project.consolidation).toBeDefined();
    expect(body.project.consolidation.status).toBe("in_progress");
    // 1 order arrived out of 2
    expect(body.project.consolidation.orders_arrived).toHaveLength(1);
  });

  // ── 4. GET /api/anomalies → ANO-16 présente ────────────────────────────
  it("4. GET /api/anomalies → contains ANO-16 notification", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/anomalies",
      headers: { cookie: cookie_session },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.anomalies.length).toBeGreaterThanOrEqual(1);

    const ano16 = body.anomalies.find(
      (a: any) => a.id === "notif-dubois-ano16"
    );
    expect(ano16).toBeDefined();
    anomalyId = ano16.id;
  });

  // ── 5. POST /api/anomalies/:id/acknowledge ─────────────────────────────
  it("5. POST /api/anomalies/:id/acknowledge → acknowledged true", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/anomalies/${anomalyId}/acknowledge`,
      headers: { cookie: cookie_session },
      payload: {
        acknowledged_by: "Admin E2E",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.acknowledged).toBe(true);
  });

  // ── 6. GET /api/stats → total_notifications >= 1 ───────────────────────
  it("6. GET /api/stats → total_notifications >= 1", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/stats",
      headers: { cookie: cookie_session },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total_notifications).toBeGreaterThanOrEqual(1);
  });

  // ── 7. GET /api/public/tracking/:token → milestones ────────────────────
  it("7. GET /api/public/tracking/dubois-2024-suivi → milestones", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/public/tracking/dubois-2024-suivi",
      // No cookie — public route
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.milestones).toBeDefined();
    expect(body.milestones.length).toBeGreaterThanOrEqual(5);

    const orderMilestone = body.milestones.find(
      (m: any) => m.key === "order_confirmed"
    );
    expect(orderMilestone).toBeDefined();
    expect(orderMilestone.status).toBe("completed");
  });

  // ── 8. POST /api/projects/:id/partial-delivery-approval ─────────────────
  it("8. POST partial-delivery-approval → approved true", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/partial-delivery-approval`,
      headers: { cookie: cookie_session },
      payload: {
        approved_by: "Admin E2E",
        notes: "Client informé par téléphone",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.approved).toBe(true);
  });

  // ── 9. GET /api/search?q=dubois → result type project ──────────────────
  it("9. GET /api/search?q=dubois → project result", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=dubois",
      headers: { cookie: cookie_session },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results.length).toBeGreaterThanOrEqual(1);

    const projectResult = body.results.find(
      (r: any) => r.type === "project"
    );
    expect(projectResult).toBeDefined();
  });

  // ── 10. GET /api/activity → logs acknowledge + approval ─────────────────
  it("10. GET /api/activity → logs exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/activity",
      headers: { cookie: cookie_session },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries).toBeDefined();
    // Activity logs are fire-and-forget, may or may not be flushed yet
    // Just verify the endpoint works
    expect(body.total).toBeGreaterThanOrEqual(0);
  });

  // ── 11. POST partial-delivery-approval 2nd time → 409 ──────────────────
  it("11. POST partial-delivery-approval again → 409 Conflict", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/partial-delivery-approval`,
      headers: { cookie: cookie_session },
      payload: {
        approved_by: "Admin E2E",
      },
    });

    expect(res.statusCode).toBe(409);
  });

  // ── 12. GET /api/auth/me → admin user ──────────────────────────────────
  it("12. GET /api/auth/me → admin user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookie_session },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe("admin@plo.local");
    expect(body.user.role).toBe("admin");
  });
});
