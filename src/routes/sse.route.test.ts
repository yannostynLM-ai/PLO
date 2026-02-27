import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic import of the server
// ---------------------------------------------------------------------------

const mockRegister = vi.fn();
const mockUnregister = vi.fn();

vi.mock("../services/sse.service.js", () => ({
  registerSseClient: mockRegister,
  unregisterSseClient: mockUnregister,
  broadcastNotification: vi.fn(),
}));

const mockPrisma = {
  notification: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  project: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  event: { update: vi.fn(), updateMany: vi.fn() },
  activityLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  order: { findMany: vi.fn() },
  anomalyRule: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
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
// GET /api/sse/notifications
// =============================================================================

describe("GET /api/sse/notifications", () => {
  it("returns 401 without JWT cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/sse/notifications",
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 401 with an invalid JWT cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/sse/notifications",
      headers: { cookie: "plo_session=invalid.jwt.token" },
    });

    expect(res.statusCode).toBe(401);
  });

  // Note: Tests for authenticated SSE connections are skipped because
  // reply.hijack() prevents app.inject() from resolving (hangs forever).
  // The SSE service logic is tested in sse.service.test.ts instead.
});
