import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// =============================================================================
// Mocks
// =============================================================================

const mockPrisma = {
  project: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  anomalyRule: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  notification: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  activityLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  order: { findMany: vi.fn() },
  event: { update: vi.fn() },
  consolidation: { findUnique: vi.fn() },
  projectNote: { create: vi.fn() },
};

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../lib/activity.js", () => ({ logActivity: vi.fn() }));
vi.mock("../lib/redis.js", () => ({ redis: { quit: vi.fn() } }));
vi.mock("../lib/queue.js", () => ({
  eventQueue: { add: vi.fn(), close: vi.fn() },
  deadLetterQueue: { add: vi.fn(), close: vi.fn() },
}));

// =============================================================================
// Server setup
// =============================================================================

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
// Tests — Search route
// =============================================================================

describe("GET /api/search", () => {
  it("returns multi-entity results", async () => {
    mockPrisma.project.findMany
      .mockResolvedValueOnce([
        { id: "proj-1", customer_id: "CLI-DUBOIS", project_type: "kitchen", status: "active" },
      ])
      .mockResolvedValueOnce([
        { customer_id: "CLI-DUBOIS" },
      ]);
    mockPrisma.anomalyRule.findMany.mockResolvedValue([
      { id: "rule-1", name: "Dubois rule", scope: "project", severity: "warning" },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=dubois",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results).toBeDefined();
    expect(body.query).toBe("dubois");
    expect(body.results.length).toBeGreaterThanOrEqual(1);
  });

  it("returns project type in results", async () => {
    mockPrisma.project.findMany
      .mockResolvedValueOnce([
        { id: "proj-1", customer_id: "CLI-TEST", project_type: "kitchen", status: "active" },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.anomalyRule.findMany.mockResolvedValue([]);

    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=test",
      headers: { cookie },
    });

    const body = res.json();
    const projectResult = body.results.find((r: any) => r.type === "project");
    expect(projectResult).toBeDefined();
    expect(projectResult.label).toBe("CLI-TEST");
  });

  it("rejects query shorter than 2 characters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=a",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(422);
  });

  it("respects limit parameter", async () => {
    mockPrisma.project.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.anomalyRule.findMany.mockResolvedValue([]);

    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=test&limit=2",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
  });

  it("returns 401 without JWT", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=dubois",
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns results with correct type fields", async () => {
    mockPrisma.project.findMany
      .mockResolvedValueOnce([
        { id: "proj-1", customer_id: "DUBOIS-2024", project_type: "kitchen", status: "active" },
      ])
      .mockResolvedValueOnce([
        { customer_id: "DUBOIS-2024" },
      ]);
    mockPrisma.anomalyRule.findMany.mockResolvedValue([]);

    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=DUBOIS",
      headers: { cookie },
    });

    const body = res.json();
    const projectResult = body.results.find((r: any) => r.type === "project");
    expect(projectResult).toBeDefined();
    expect(projectResult.id).toBe("proj-1");
    expect(projectResult.path).toContain("/projects/");

    const customerResult = body.results.find((r: any) => r.type === "customer");
    expect(customerResult).toBeDefined();
    expect(customerResult.label).toBe("DUBOIS-2024");
  });
});
