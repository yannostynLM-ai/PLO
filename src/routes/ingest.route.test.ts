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

vi.mock("../config.js", () => ({
  config: {
    JWT_SECRET: "test-secret",
    PORT: 3000,
    HOST: "0.0.0.0",
    API_KEYS: { "test-key-erp": "erp" },
    INGEST_KEYS: {},
    SMTP_HOST: "",
    SMTP_PORT: 587,
    SMTP_USER: "",
    SMTP_PASS: "",
    SMTP_FROM: "plo@test.local",
    ESCALATION_HOURS: 4,
    ALERT_EMAILS: { manager: "", ops: "" },
    ANTHROPIC_API_KEY: "",
    ADMIN_PASSWORD: "admin1234",
  },
}));

vi.mock("../services/event.service.js", () => ({
  ingestEvent: vi.fn(),
  deriveSeverity: vi.fn(() => "ok"),
}));

vi.mock("../adapters/registry.js", () => ({
  getAdapter: vi.fn(() => ({
    adapt: vi.fn((input: Record<string, unknown>) => ({
      source: input.source,
      source_ref: input.source_ref,
      event_type: input.event_type,
      project_ref: input.project_ref,
      occurred_at: input.occurred_at,
      order_ref: input.order_ref ?? null,
      payload: input.payload ?? {},
    })),
  })),
}));

// ---------------------------------------------------------------------------
// Import mocked service
// ---------------------------------------------------------------------------

import { ingestEvent } from "../services/event.service.js";
const mockIngestEvent = ingestEvent as ReturnType<typeof vi.fn>;

import { getAdapter } from "../adapters/registry.js";
import { AdapterError } from "../adapters/types.js";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let app: FastifyInstance;

const VALID_BODY = {
  source_ref: "ref-1",
  event_type: "order.confirmed",
  project_ref: "proj-ref-1",
  occurred_at: "2026-02-26T10:00:00Z",
};

const AUTH_HEADER = { authorization: "Bearer test-key-erp" };

beforeAll(async () => {
  const { buildServer } = await import("../server.js");
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// POST /api/events/ingest
// =============================================================================

describe("POST /api/events/ingest", () => {
  it("returns 201 when event is created", async () => {
    mockIngestEvent.mockResolvedValueOnce({
      status: "created",
      event_id: "e-1",
      project_id: "p-1",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/events/ingest",
      headers: AUTH_HEADER,
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.event_id).toBe("e-1");
    expect(body.project_id).toBe("p-1");
  });

  it("returns 200 when event is a duplicate", async () => {
    mockIngestEvent.mockResolvedValueOnce({
      status: "duplicate",
      event_id: "e-1",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/events/ingest",
      headers: AUTH_HEADER,
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.duplicate).toBe(true);
    expect(body.event_id).toBe("e-1");
  });

  it("returns 202 when event goes to dead letter queue", async () => {
    mockIngestEvent.mockResolvedValueOnce({
      status: "dead_letter",
      message: "Projet non résolu",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/events/ingest",
      headers: AUTH_HEADER,
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.dead_letter).toBe(true);
    expect(body.message).toBe("Projet non résolu");
  });

  it("returns 422 when source_ref is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/ingest",
      headers: AUTH_HEADER,
      payload: {
        event_type: "order.confirmed",
        project_ref: "proj-ref-1",
        occurred_at: "2026-02-26T10:00:00Z",
      },
    });

    expect(res.statusCode).toBe(422);
    expect(mockIngestEvent).not.toHaveBeenCalled();
  });

  it("returns 422 when occurred_at is not ISO8601", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/ingest",
      headers: AUTH_HEADER,
      payload: {
        source_ref: "ref-1",
        event_type: "order.confirmed",
        project_ref: "proj-ref-1",
        occurred_at: "26-02-2026 10:00",
      },
    });

    expect(res.statusCode).toBe(422);
    expect(mockIngestEvent).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/ingest",
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(401);
    expect(mockIngestEvent).not.toHaveBeenCalled();
  });

  it("returns 401 with invalid Bearer token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/ingest",
      headers: { authorization: "Bearer invalid-key-xyz" },
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(401);
    expect(mockIngestEvent).not.toHaveBeenCalled();
  });

  it("returns 422 when event_type is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/ingest",
      headers: AUTH_HEADER,
      payload: {
        source_ref: "ref-1",
        project_ref: "proj-ref-1",
        occurred_at: "2026-02-26T10:00:00Z",
      },
    });

    expect(res.statusCode).toBe(422);
    expect(mockIngestEvent).not.toHaveBeenCalled();
  });

  it("returns 422 when adapter throws AdapterError", async () => {
    (getAdapter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      adapt: vi.fn(() => {
        throw new AdapterError("Champ manquant: order_ref", { field: "order_ref" });
      }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/events/ingest",
      headers: AUTH_HEADER,
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error).toBe("Unprocessable Entity");
    expect(body.message).toContain("Champ manquant");
    expect(body.details).toEqual({ field: "order_ref" });
    expect(mockIngestEvent).not.toHaveBeenCalled();
  });

  it("re-throws non-AdapterError as 500", async () => {
    (getAdapter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      adapt: vi.fn(() => {
        throw new Error("Unexpected crash");
      }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/events/ingest",
      headers: AUTH_HEADER,
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(500);
    expect(mockIngestEvent).not.toHaveBeenCalled();
  });
});
