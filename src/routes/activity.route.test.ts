import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic import of the server
// ---------------------------------------------------------------------------

const mockPrisma = {
  activityLog: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  project: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  order: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  notification: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  anomalyRule: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  consolidation: { findUnique: vi.fn(), update: vi.fn() },
  projectNote: { create: vi.fn() },
  event: { update: vi.fn() },
  user: { findUnique: vi.fn() },
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
// GET /api/activity
// =============================================================================

describe("GET /api/activity", () => {
  it("returns 200 with entries and total", async () => {
    const mockEntries = [
      {
        id: "log-1",
        action: "project_created",
        entity_type: "project",
        entity_id: "p-1",
        operator_name: "Admin",
        created_at: new Date("2026-02-20T10:00:00Z"),
      },
      {
        id: "log-2",
        action: "anomaly_acknowledged",
        entity_type: "anomaly",
        entity_id: "n-1",
        operator_name: "Operator",
        created_at: new Date("2026-02-21T12:00:00Z"),
      },
    ];

    mockPrisma.activityLog.findMany.mockResolvedValueOnce(mockEntries);
    mockPrisma.activityLog.count.mockResolvedValueOnce(2);

    const res = await app.inject({
      method: "GET",
      url: "/api/activity",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries).toBeInstanceOf(Array);
    expect(body.entries).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("passes entity_type filter to prisma query", async () => {
    mockPrisma.activityLog.findMany.mockResolvedValueOnce([]);
    mockPrisma.activityLog.count.mockResolvedValueOnce(0);

    const res = await app.inject({
      method: "GET",
      url: "/api/activity?entity_type=project",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);

    const findManyCall = mockPrisma.activityLog.findMany.mock.calls[0][0];
    expect(findManyCall.where.entity_type).toBe("project");
  });

  it("passes operator contains filter to prisma query", async () => {
    mockPrisma.activityLog.findMany.mockResolvedValueOnce([]);
    mockPrisma.activityLog.count.mockResolvedValueOnce(0);

    const res = await app.inject({
      method: "GET",
      url: "/api/activity?operator=Admin",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);

    const findManyCall = mockPrisma.activityLog.findMany.mock.calls[0][0];
    expect(findManyCall.where.operator_name).toEqual({
      contains: "Admin",
      mode: "insensitive",
    });
  });

  it("passes date range filter with from and to", async () => {
    mockPrisma.activityLog.findMany.mockResolvedValueOnce([]);
    mockPrisma.activityLog.count.mockResolvedValueOnce(0);

    const res = await app.inject({
      method: "GET",
      url: "/api/activity?from=2026-01-01&to=2026-02-01",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);

    const findManyCall = mockPrisma.activityLog.findMany.mock.calls[0][0];
    expect(findManyCall.where.created_at).toBeDefined();
    expect(findManyCall.where.created_at.gte).toEqual(new Date("2026-01-01"));
    expect(findManyCall.where.created_at.lte).toEqual(new Date("2026-02-01"));
  });

  it("passes limit to take parameter", async () => {
    mockPrisma.activityLog.findMany.mockResolvedValueOnce([]);
    mockPrisma.activityLog.count.mockResolvedValueOnce(0);

    const res = await app.inject({
      method: "GET",
      url: "/api/activity?limit=10",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);

    const findManyCall = mockPrisma.activityLog.findMany.mock.calls[0][0];
    expect(findManyCall.take).toBe(10);
  });

  it("returns 401 without JWT cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/activity",
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 422 when limit exceeds maximum", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/activity?limit=200",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("Unprocessable Entity");
    expect(mockPrisma.activityLog.findMany).not.toHaveBeenCalled();
  });
});
