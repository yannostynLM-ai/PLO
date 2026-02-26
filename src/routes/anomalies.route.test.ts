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
  event: {
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  // Stubs required by other routes registered in buildServer
  user: { findUnique: vi.fn() },
  project: { count: vi.fn() },
  activityLog: { create: vi.fn() },
};

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

const mockLogActivity = vi.fn();
vi.mock("../lib/activity.js", () => ({ logActivity: mockLogActivity }));

vi.mock("../lib/redis.js", () => ({ redis: { quit: vi.fn() } }));
vi.mock("../lib/queue.js", () => ({
  eventQueue: { add: vi.fn(), close: vi.fn() },
  deadLetterQueue: { add: vi.fn(), close: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

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
// GET /api/anomalies
// =============================================================================

describe("GET /api/anomalies", () => {
  it("returns 200 with anomalies array and pagination metadata", async () => {
    const mockNotifications = [
      {
        id: "n-1",
        status: "sent",
        sent_at: new Date(),
        rule: { id: "r-1", name: "rule-a", severity: "critical", scope: "project" },
        project: { id: "p-1", customer_id: "CLI-001", project_type: "installation", status: "active" },
        event: { id: "e-1", event_type: "delay", acknowledged_by: null, created_at: new Date() },
      },
    ];

    mockPrisma.notification.findMany.mockResolvedValueOnce(mockNotifications);
    mockPrisma.notification.count.mockResolvedValueOnce(1);

    const res = await app.inject({
      method: "GET",
      url: "/api/anomalies",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.anomalies).toBeInstanceOf(Array);
    expect(body.anomalies).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.pages).toBe(1);
  });

  it("passes severity filter to prisma query", async () => {
    mockPrisma.notification.findMany.mockResolvedValueOnce([]);
    mockPrisma.notification.count.mockResolvedValueOnce(0);

    const res = await app.inject({
      method: "GET",
      url: "/api/anomalies?severity=critical",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);

    // Verify that findMany was called with a where clause containing rule severity
    const findManyCall = mockPrisma.notification.findMany.mock.calls[0][0];
    expect(findManyCall.where.rule).toEqual({ severity: "critical" });
  });

  it("returns 401 without JWT cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/anomalies",
    });

    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// POST /api/anomalies/:id/acknowledge
// =============================================================================

describe("POST /api/anomalies/:id/acknowledge", () => {
  it("returns 200 with acknowledged: true for a valid notification", async () => {
    mockPrisma.notification.findUnique.mockResolvedValueOnce({
      id: "n-1",
      event_id: "evt-1",
      status: "sent",
      project: { customer_id: "CLI-001" },
    });
    mockPrisma.event.update.mockResolvedValueOnce({});

    const res = await app.inject({
      method: "POST",
      url: "/api/anomalies/n-1/acknowledge",
      headers: { cookie },
      payload: { acknowledged_by: "operator-1" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.acknowledged).toBe(true);
    expect(body.notification_id).toBe("n-1");
    expect(body.acknowledged_by).toBe("operator-1");

    // Verify event was updated
    expect(mockPrisma.event.update).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: { acknowledged_by: "operator-1" },
    });

    // Verify activity was logged
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "anomaly_acknowledged",
        entity_type: "anomaly",
        entity_id: "n-1",
      }),
    );
  });

  it("returns 404 when notification is not found", async () => {
    mockPrisma.notification.findUnique.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/anomalies/unknown-id/acknowledge",
      headers: { cookie },
      payload: { acknowledged_by: "operator-1" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe("Notification introuvable");
  });

  it("returns 422 when body is missing acknowledged_by", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/anomalies/n-1/acknowledge",
      headers: { cookie },
      payload: {},
    });

    expect(res.statusCode).toBe(422);
  });

  it("returns 401 without JWT cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/anomalies/n-1/acknowledge",
      payload: { acknowledged_by: "operator-1" },
    });

    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// POST /api/anomalies/bulk-acknowledge
// =============================================================================

describe("POST /api/anomalies/bulk-acknowledge", () => {
  it("returns 200 with acknowledged count for valid ids", async () => {
    const mockNotifications = [
      { id: "n-1", event_id: "evt-1" },
      { id: "n-2", event_id: "evt-2" },
    ];

    mockPrisma.notification.findMany.mockResolvedValueOnce(mockNotifications);
    mockPrisma.event.updateMany.mockResolvedValueOnce({ count: 2 });

    const res = await app.inject({
      method: "POST",
      url: "/api/anomalies/bulk-acknowledge",
      headers: { cookie },
      payload: {
        ids: ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440002"],
        acknowledged_by: "operator-1",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.acknowledged).toBe(2);
    expect(body.ids).toHaveLength(2);

    // Verify event.updateMany was called
    expect(mockPrisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["evt-1", "evt-2"] }, acknowledged_by: null },
      data: { acknowledged_by: "operator-1" },
    });

    // Verify activity was logged
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "anomaly_bulk_acknowledged",
        entity_type: "anomaly",
      }),
    );
  });

  it("returns 422 when ids array is empty", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/anomalies/bulk-acknowledge",
      headers: { cookie },
      payload: { ids: [], acknowledged_by: "operator-1" },
    });

    expect(res.statusCode).toBe(422);
  });

  it("returns 404 when no matching notifications are found", async () => {
    mockPrisma.notification.findMany.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "POST",
      url: "/api/anomalies/bulk-acknowledge",
      headers: { cookie },
      payload: {
        ids: ["550e8400-e29b-41d4-a716-446655440099"],
        acknowledged_by: "operator-1",
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe("Aucune notification trouvée");
  });
});
