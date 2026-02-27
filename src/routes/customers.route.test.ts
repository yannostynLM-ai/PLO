import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Mocks — MUST be declared before any server import
// ---------------------------------------------------------------------------

const mockPrisma = {
  project: { findMany: vi.fn(), count: vi.fn() },
  notification: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  event: { update: vi.fn(), updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
  user: { findUnique: vi.fn() },
  order: { findMany: vi.fn() },
  anomalyRule: { findMany: vi.fn() },
  consolidation: { findUnique: vi.fn() },
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

beforeAll(async () => {
  const { buildServer } = await import("../server.js");
  app = await buildServer();
  await app.ready();
  cookie = `plo_session=${app.jwt.sign({ id: "user-1", email: "admin@plo.local", name: "Admin", role: "admin" })}`;
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildProjectRow = (overrides = {}) => ({
  id: "proj-1",
  customer_id: "CUST-001",
  project_type: "kitchen",
  status: "active",
  channel_origin: "store",
  store_id: "STORE-A",
  created_at: new Date("2025-10-01"),
  updated_at: new Date("2025-10-02"),
  notifications: [],
  events: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Customers route", () => {
  // ========================================================================
  // GET /api/customers
  // ========================================================================

  describe("GET /api/customers", () => {
    it("returns 200 with aggregated customer list", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        buildProjectRow(),
        buildProjectRow({ id: "proj-2", customer_id: "CUST-002" }),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/customers",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.customers)).toBe(true);
      expect(body.customers.length).toBe(2);
      expect(body.customers[0].customer_id).toBeDefined();
      expect(body.customers[0].project_count).toBe(1);
    });

    it("aggregates severity: highest severity wins across projects", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        buildProjectRow({
          id: "proj-1",
          customer_id: "CUST-001",
          notifications: [
            {
              sent_at: new Date(),
              status: "sent",
              rule: { severity: "critical" },
              event: { acknowledged_by: null, created_at: new Date() },
            },
          ],
        }),
        buildProjectRow({
          id: "proj-2",
          customer_id: "CUST-001",
          notifications: [],
        }),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/customers",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.customers.length).toBe(1);
      expect(body.customers[0].anomaly_severity).toBe("critical");
    });

    it("sorts customers: critical before warning before ok", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        buildProjectRow({
          id: "proj-ok",
          customer_id: "CUST-OK",
          notifications: [],
        }),
        buildProjectRow({
          id: "proj-warn",
          customer_id: "CUST-WARN",
          notifications: [
            {
              sent_at: new Date(),
              status: "sent",
              rule: { severity: "warning" },
              event: { acknowledged_by: null, created_at: new Date() },
            },
          ],
        }),
        buildProjectRow({
          id: "proj-crit",
          customer_id: "CUST-CRIT",
          notifications: [
            {
              sent_at: new Date(),
              status: "sent",
              rule: { severity: "critical" },
              event: { acknowledged_by: null, created_at: new Date() },
            },
          ],
        }),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/customers",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.customers[0].customer_id).toBe("CUST-CRIT");
      expect(body.customers[1].customer_id).toBe("CUST-WARN");
      expect(body.customers[2].customer_id).toBe("CUST-OK");
    });

    it("passes contains filter to prisma when q param is provided", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        buildProjectRow({ customer_id: "CUST-DUB-001" }),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/customers?q=DUB",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const callArgs = mockPrisma.project.findMany.mock.calls[0][0];
      expect(callArgs.where.customer_id).toEqual({
        contains: "DUB",
        mode: "insensitive",
      });
    });

    it("excludes completed/cancelled from active_project_count", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        buildProjectRow({ id: "proj-1", customer_id: "CUST-001", status: "active" }),
        buildProjectRow({ id: "proj-2", customer_id: "CUST-001", status: "completed" }),
        buildProjectRow({ id: "proj-3", customer_id: "CUST-001", status: "cancelled" }),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/customers",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.customers[0].project_count).toBe(3);
      expect(body.customers[0].active_project_count).toBe(1);
    });

    it("sums unacknowledged notifications into active_anomaly_count", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        buildProjectRow({
          id: "proj-1",
          customer_id: "CUST-001",
          notifications: [
            {
              sent_at: new Date(),
              status: "sent",
              rule: { severity: "warning" },
              event: { acknowledged_by: null, created_at: new Date() },
            },
            {
              sent_at: new Date(),
              status: "sent",
              rule: { severity: "critical" },
              event: { acknowledged_by: null, created_at: new Date() },
            },
          ],
        }),
        buildProjectRow({
          id: "proj-2",
          customer_id: "CUST-001",
          notifications: [
            {
              sent_at: new Date(),
              status: "sent",
              rule: { severity: "warning" },
              event: { acknowledged_by: "someone", created_at: new Date() },
            },
          ],
        }),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/customers",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // 2 unacked from proj-1, 0 unacked from proj-2 (acknowledged)
      expect(body.customers[0].active_anomaly_count).toBe(2);
    });

    it("returns 401 without JWT cookie", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/customers",
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Unauthorized");
    });
  });

  // ========================================================================
  // GET /api/customers/:customerId
  // ========================================================================

  describe("GET /api/customers/:customerId", () => {
    it("returns 200 with project summaries and stats", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        buildProjectRow({
          id: "proj-1",
          customer_id: "CUST-001",
          notifications: [
            {
              sent_at: new Date(),
              status: "sent",
              rule: { severity: "warning" },
              event: { acknowledged_by: null, created_at: new Date() },
            },
          ],
          events: [{ created_at: new Date("2025-10-15") }],
        }),
        buildProjectRow({
          id: "proj-2",
          customer_id: "CUST-001",
          status: "completed",
          notifications: [],
          events: [],
        }),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/customers/CUST-001",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.customer_id).toBe("CUST-001");
      expect(Array.isArray(body.projects)).toBe(true);
      expect(body.projects.length).toBe(2);
      expect(body.stats).toBeDefined();
      expect(body.stats.project_count).toBe(2);
    });

    it("returns 404 when no projects found for customer", async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/customers/UNKNOWN-CUST",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
    });

    it("returns correct aggregated values in stats", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        buildProjectRow({
          id: "proj-1",
          customer_id: "CUST-001",
          status: "active",
          notifications: [
            {
              sent_at: new Date(),
              status: "sent",
              rule: { severity: "critical" },
              event: { acknowledged_by: null, created_at: new Date() },
            },
            {
              sent_at: new Date(),
              status: "sent",
              rule: { severity: "warning" },
              event: { acknowledged_by: null, created_at: new Date() },
            },
          ],
          events: [{ created_at: new Date() }],
        }),
        buildProjectRow({
          id: "proj-2",
          customer_id: "CUST-001",
          status: "completed",
          notifications: [
            {
              sent_at: new Date(),
              status: "sent",
              rule: { severity: "warning" },
              event: { acknowledged_by: "operator", created_at: new Date() },
            },
          ],
          events: [],
        }),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/customers/CUST-001",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.stats.project_count).toBe(2);
      expect(body.stats.active_project_count).toBe(1);
      expect(body.stats.anomaly_severity).toBe("critical");
      expect(body.stats.active_anomaly_count).toBe(2);
    });
  });
});
