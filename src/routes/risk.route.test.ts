import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic import of the server
// ---------------------------------------------------------------------------

const mockPrisma = {
  project: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  order: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  notification: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  anomalyRule: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  consolidation: { findUnique: vi.fn(), update: vi.fn() },
  projectNote: { create: vi.fn() },
  activityLog: { create: vi.fn() },
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

vi.mock("../services/risk-analysis.service.js", () => ({
  analyzeProjectRisk: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import mocked service
// ---------------------------------------------------------------------------

import { analyzeProjectRisk } from "../services/risk-analysis.service.js";
const mockAnalyze = analyzeProjectRisk as ReturnType<typeof vi.fn>;

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
// GET /api/projects/:id/risk-analysis
// =============================================================================

describe("GET /api/projects/:id/risk-analysis", () => {
  it("returns 200 with analysis object when project is found", async () => {
    const mockAnalysis = {
      risk_score: 45,
      level: "medium",
      summary: "Risque modéré détecté sur le projet",
      factors: [
        { factor: "delivery_delay", impact: "medium", detail: "Retard livraison de 3 jours" },
      ],
      recommendation: "Surveiller les prochaines livraisons",
      generated_at: "2026-02-26T10:00:00.000Z",
      cached: false,
    };

    mockAnalyze.mockResolvedValueOnce(mockAnalysis);

    const res = await app.inject({
      method: "GET",
      url: "/api/projects/proj-1/risk-analysis",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.risk_score).toBe(45);
    expect(body.level).toBe("medium");
    expect(body.summary).toBeDefined();
    expect(body.factors).toBeInstanceOf(Array);
    expect(body.recommendation).toBeDefined();
    expect(body.generated_at).toBeDefined();
    expect(body.cached).toBe(false);
    expect(mockAnalyze).toHaveBeenCalledWith("proj-1");
  });

  it("returns 404 when analyzeProjectRisk returns null", async () => {
    mockAnalyze.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/projects/unknown-id/risk-analysis",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    expect(mockAnalyze).toHaveBeenCalledWith("unknown-id");
  });

  it("returns 401 without JWT cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/proj-1/risk-analysis",
    });

    expect(res.statusCode).toBe(401);
    expect(mockAnalyze).not.toHaveBeenCalled();
  });
});
