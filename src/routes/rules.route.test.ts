import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Mocks — MUST be declared before any server import
// ---------------------------------------------------------------------------

const mockPrisma = {
  project: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  order: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  notification: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  anomalyRule: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  consolidation: { findUnique: vi.fn(), update: vi.fn() },
  projectNote: { create: vi.fn() },
  activityLog: { create: vi.fn() },
  event: { update: vi.fn() },
};

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../lib/activity.js", () => ({ logActivity: vi.fn() }));
vi.mock("../lib/redis.js", () => ({ redis: { quit: vi.fn() } }));
vi.mock("../lib/queue.js", () => ({
  eventQueue: { add: vi.fn(), close: vi.fn() },
  deadLetterQueue: { add: vi.fn(), close: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Server + JWT cookies
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let cookie: string;
let nonAdminCookie: string;

beforeAll(async () => {
  const { buildServer } = await import("../server.js");
  app = await buildServer();
  await app.ready();
  cookie = `plo_session=${app.jwt.sign({ id: "user-1", email: "admin@plo.local", name: "Admin", role: "admin" })}`;
  nonAdminCookie = `plo_session=${app.jwt.sign({ id: "user-2", email: "user@plo.local", name: "User", role: "operator" })}`;
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Rules route", () => {
  // ========================================================================
  // GET /api/rules
  // ========================================================================

  describe("GET /api/rules", () => {
    it("returns 200 with rules array", async () => {
      const fakeRules = [
        {
          id: "rule-1",
          name: "Delay > 48h",
          scope: "order",
          step_type: "delivery",
          severity: "warning",
          condition: { delay_hours: 48 },
          action: { notify: true },
          active: true,
          created_at: new Date("2025-09-01"),
          updated_at: new Date("2025-09-01"),
        },
        {
          id: "rule-2",
          name: "Critical missing step",
          scope: "project",
          step_type: "validation",
          severity: "critical",
          condition: { missing: true },
          action: { escalate: true },
          active: true,
          created_at: new Date("2025-09-02"),
          updated_at: new Date("2025-09-02"),
        },
      ];
      mockPrisma.anomalyRule.findMany.mockResolvedValue(fakeRules);

      const res = await app.inject({
        method: "GET",
        url: "/api/rules",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.rules)).toBe(true);
      expect(body.rules.length).toBe(2);
      expect(mockPrisma.anomalyRule.findMany).toHaveBeenCalledOnce();
    });

    it("returns 401 without JWT cookie", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/rules",
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Unauthorized");
    });
  });

  // ========================================================================
  // POST /api/rules
  // ========================================================================

  describe("POST /api/rules", () => {
    const validPayload = {
      name: "New rule",
      scope: "order",
      step_type: "shipping",
      severity: "warning",
      condition: { delay_hours: 24 },
      action: { notify: true },
    };

    it("creates a rule as admin and returns 201", async () => {
      const fakeRule = {
        id: "rule-new",
        ...validPayload,
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPrisma.anomalyRule.create.mockResolvedValue(fakeRule);

      const res = await app.inject({
        method: "POST",
        url: "/api/rules",
        headers: { cookie },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.rule).toBeDefined();
      expect(body.rule.id).toBe("rule-new");
      expect(body.rule.name).toBe("New rule");
      expect(mockPrisma.anomalyRule.create).toHaveBeenCalledOnce();
    });

    it("returns 403 for non-admin user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/rules",
        headers: { cookie: nonAdminCookie },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("Forbidden");
      expect(mockPrisma.anomalyRule.create).not.toHaveBeenCalled();
    });

    it("returns 422 when name is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/rules",
        headers: { cookie },
        payload: {
          scope: "order",
          step_type: "shipping",
          severity: "warning",
          condition: { delay_hours: 24 },
          action: { notify: true },
        },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe("Unprocessable Entity");
      expect(mockPrisma.anomalyRule.create).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // PATCH /api/rules/:id
  // ========================================================================

  describe("PATCH /api/rules/:id", () => {
    it("updates a rule as admin and returns 200", async () => {
      mockPrisma.anomalyRule.findUnique.mockResolvedValue({ id: "rule-1" });
      const updatedRule = {
        id: "rule-1",
        name: "Updated rule",
        scope: "order",
        step_type: "delivery",
        severity: "critical",
        condition: { delay_hours: 72 },
        action: { notify: true },
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPrisma.anomalyRule.update.mockResolvedValue(updatedRule);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/rules/rule-1",
        headers: { cookie },
        payload: { name: "Updated rule", severity: "critical" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.rule.name).toBe("Updated rule");
      expect(body.rule.severity).toBe("critical");
      expect(mockPrisma.anomalyRule.update).toHaveBeenCalledOnce();
    });

    it("returns 403 for non-admin user", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/rules/rule-1",
        headers: { cookie: nonAdminCookie },
        payload: { name: "Hacked" },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("Forbidden");
      expect(mockPrisma.anomalyRule.update).not.toHaveBeenCalled();
    });

    it("returns 404 for unknown rule id", async () => {
      mockPrisma.anomalyRule.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/rules/unknown-id",
        headers: { cookie },
        payload: { name: "Does not exist" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
      expect(mockPrisma.anomalyRule.update).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // DELETE /api/rules/:id
  // ========================================================================

  describe("DELETE /api/rules/:id", () => {
    it("deletes a rule as admin and returns 204", async () => {
      mockPrisma.anomalyRule.findUnique.mockResolvedValue({
        id: "rule-1",
        name: "Old rule",
        _count: { notifications: 0 },
      });
      mockPrisma.anomalyRule.delete.mockResolvedValue({});

      const res = await app.inject({
        method: "DELETE",
        url: "/api/rules/rule-1",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(204);
      expect(mockPrisma.anomalyRule.delete).toHaveBeenCalledWith({ where: { id: "rule-1" } });
    });

    it("returns 409 when rule has existing notifications", async () => {
      mockPrisma.anomalyRule.findUnique.mockResolvedValue({
        id: "rule-1",
        name: "Active rule",
        _count: { notifications: 5 },
      });

      const res = await app.inject({
        method: "DELETE",
        url: "/api/rules/rule-1",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("Conflict");
      expect(mockPrisma.anomalyRule.delete).not.toHaveBeenCalled();
    });

    it("returns 404 for unknown rule id", async () => {
      mockPrisma.anomalyRule.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "DELETE",
        url: "/api/rules/unknown-id",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
      expect(mockPrisma.anomalyRule.delete).not.toHaveBeenCalled();
    });

    it("returns 403 for non-admin user", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/rules/rule-1",
        headers: { cookie: nonAdminCookie },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("Forbidden");
      expect(mockPrisma.anomalyRule.delete).not.toHaveBeenCalled();
    });
  });
});
