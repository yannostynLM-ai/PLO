import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic import of the server
// ---------------------------------------------------------------------------

const mockPrisma = {
  notification: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
  },
  project: {
    count: vi.fn(),
  },
  // Stubs required by other routes registered in buildServer
  user: { findUnique: vi.fn() },
  event: { update: vi.fn(), updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
};

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../lib/activity.js", () => ({ logActivity: vi.fn() }));
vi.mock("../lib/redis.js", () => ({ redis: { quit: vi.fn() } }));
vi.mock("../lib/queue.js", () => ({
  eventQueue: { add: vi.fn(), close: vi.fn() },
  deadLetterQueue: { add: vi.fn(), close: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const now = new Date();
const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3_600_000);
const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 3_600_000);

const MOCK_NOTIFICATIONS = [
  {
    id: "n-1",
    status: "sent",
    rule_id: "r-1",
    created_at: twoDaysAgo,
    sent_at: twoDaysAgo,
    rule: { id: "r-1", name: "Retard livraison", severity: "critical" },
    event: { acknowledged_by: "operator-1", processed_at: twoDaysAgo },
  },
  {
    id: "n-2",
    status: "sent",
    rule_id: "r-2",
    created_at: tenDaysAgo,
    sent_at: tenDaysAgo,
    rule: { id: "r-2", name: "Stock faible", severity: "warning" },
    event: { acknowledged_by: null, processed_at: null },
  },
  {
    id: "n-3",
    status: "sent",
    rule_id: "r-1",
    created_at: twoDaysAgo,
    sent_at: twoDaysAgo,
    rule: { id: "r-1", name: "Retard livraison", severity: "critical" },
    event: { acknowledged_by: null, processed_at: null },
  },
];

let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  const { buildServer } = await import("../server.js");
  app = await buildServer();
  await app.ready();

  const token = app.jwt.sign({
    id: "user-1",
    email: "admin@plo.local",
    name: "Admin",
    role: "admin",
  });
  cookie = `plo_session=${token}`;
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// GET /api/stats
// =============================================================================

describe("GET /api/stats", () => {
  function setupStatsMocks() {
    mockPrisma.notification.findMany.mockResolvedValueOnce(MOCK_NOTIFICATIONS);
    // escalated_count
    mockPrisma.notification.count.mockResolvedValueOnce(1);
    // crm_tickets_created
    mockPrisma.notification.count.mockResolvedValueOnce(0);
    // active_projects_with_anomalies
    mockPrisma.project.count.mockResolvedValueOnce(5);
  }

  it("returns 200 with total_notifications, by_severity, and trend fields", async () => {
    setupStatsMocks();

    const res = await app.inject({
      method: "GET",
      url: "/api/stats",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.total_notifications).toBe(3);
    expect(body.by_severity).toBeDefined();
    expect(body.by_severity.critical).toBe(2);
    expect(body.by_severity.warning).toBe(1);
    expect(typeof body.trend_current_7d).toBe("number");
    expect(typeof body.trend_previous_7d).toBe("number");
  });

  it("includes period_days: 30 in the response", async () => {
    setupStatsMocks();

    const res = await app.inject({
      method: "GET",
      url: "/api/stats",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().period_days).toBe(30);
  });

  it("includes acknowledgement_rate as a number", async () => {
    setupStatsMocks();

    const res = await app.inject({
      method: "GET",
      url: "/api/stats",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.acknowledgement_rate).toBe("number");
    // 1 acknowledged out of 3 total => ~0.33
    expect(body.acknowledgement_rate).toBeGreaterThanOrEqual(0);
    expect(body.acknowledgement_rate).toBeLessThanOrEqual(1);
  });

  it("returns 401 without JWT cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/stats",
    });

    expect(res.statusCode).toBe(401);
  });
});
