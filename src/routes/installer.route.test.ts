import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic import of the server
// ---------------------------------------------------------------------------

const mockPrisma = {
  installation: { findUnique: vi.fn() },
  // Stubs required by other routes registered in buildServer
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
vi.mock("../services/sse.service.js", () => ({
  registerSseClient: vi.fn(),
  unregisterSseClient: vi.fn(),
  broadcastNotification: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let app: FastifyInstance;

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
// Helpers — mock data factories
// =============================================================================

function makeInstallationWithProject(overrides: {
  installationStatus?: string;
  lastMileStatus?: string;
  lastMileDeliveredAt?: Date | null;
  lastMileIsPartial?: boolean;
  orderStatuses?: string[];
} = {}) {
  const {
    installationStatus = "scheduled",
    lastMileStatus = "delivered",
    lastMileDeliveredAt = new Date("2026-02-25"),
    lastMileIsPartial = false,
    orderStatuses = ["closed", "closed"],
  } = overrides;

  return {
    id: "inst-1",
    project_id: "proj-1",
    status: installationStatus,
    scheduled_date: new Date("2026-03-02"),
    scheduled_slot: { start: "08:00", end: "17:00" },
    installation_address: { street: "22 rue de Vaugirard", city: "Paris", zip: "75015", country: "FR" },
    technician_id: "TECH-IDF-007",
    technician_name: "Jean-Pierre Lavigne",
    wfm_job_ref: "WFM-JOB-001",
    installer_token: "valid-installer-token",
    orders_prerequisite: ["order-a", "order-b"],
    started_at: null,
    completed_at: null,
    project: {
      id: "proj-1",
      customer_id: "CRM-CLIENT-2025",
      project_type: "bathroom",
      status: "active",
      orders: orderStatuses.map((status, i) => ({
        id: i === 0 ? "order-a" : "order-b",
        erp_order_ref: `ERP-CMD-${i === 0 ? "A" : "B"}`,
        status,
        promised_delivery_date: new Date("2026-02-20"),
        created_at: new Date("2026-01-15"),
        lines: [{ id: `line-${i}-1` }, { id: `line-${i}-2` }],
        shipments: [{
          id: `ship-${i}`,
          carrier: "DACHSER",
          carrier_tracking_ref: `DAC-${i}`,
          status: "arrived",
          estimated_arrival: new Date("2026-02-18"),
          actual_arrival: new Date("2026-02-18"),
        }],
      })),
      consolidation: {
        status: "complete",
        orders_arrived: ["order-a", "order-b"],
        orders_required: ["order-a", "order-b"],
        estimated_complete_date: new Date("2026-02-19"),
      },
      last_mile: {
        status: lastMileStatus,
        scheduled_date: new Date("2026-02-24"),
        scheduled_slot: { start: "14:00", end: "18:00" },
        delivered_at: lastMileDeliveredAt,
        is_partial: lastMileIsPartial,
      },
    },
  };
}

// =============================================================================
// GET /api/public/installer/:token
// =============================================================================

describe("GET /api/public/installer/:token", () => {
  it("returns 200 with installation details for a valid token", async () => {
    mockPrisma.installation.findUnique.mockResolvedValueOnce(
      makeInstallationWithProject(),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/public/installer/valid-installer-token",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.installation).toBeDefined();
    expect(body.installation.status).toBe("scheduled");
    expect(body.installation.technician_name).toBe("Jean-Pierre Lavigne");
    expect(body.installation.wfm_job_ref).toBe("WFM-JOB-001");
    expect(body.installation.scheduled_date).toBeDefined();
    expect(body.installation.scheduled_slot).toEqual({ start: "08:00", end: "17:00" });
    expect(body.installation.installation_address).toBeDefined();
    expect(body.project_ref).toBe("CRM-CLIENT-2025");
    expect(body.project_type_label).toBe("Salle de bain");
  });

  it("returns delivery_readiness.ready = true when all orders delivered", async () => {
    mockPrisma.installation.findUnique.mockResolvedValueOnce(
      makeInstallationWithProject({
        orderStatuses: ["closed", "closed"],
        lastMileStatus: "delivered",
        lastMileDeliveredAt: new Date("2026-02-25"),
        lastMileIsPartial: false,
      }),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/public/installer/valid-installer-token",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.delivery_readiness.ready).toBe(true);
    expect(body.delivery_readiness.summary).toBe("2/2 commandes livrées");
    expect(body.delivery_readiness.orders).toHaveLength(2);
    expect(body.delivery_readiness.orders[0].delivered).toBe(true);
    expect(body.delivery_readiness.orders[1].delivered).toBe(true);
  });

  it("returns delivery_readiness.ready = false when partial delivery", async () => {
    mockPrisma.installation.findUnique.mockResolvedValueOnce(
      makeInstallationWithProject({
        orderStatuses: ["closed", "in_fulfillment"],
        lastMileStatus: "partial_delivered",
        lastMileDeliveredAt: null,
        lastMileIsPartial: true,
      }),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/public/installer/valid-installer-token",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.delivery_readiness.ready).toBe(false);
    expect(body.delivery_readiness.summary).toBe("1/2 commandes livrées");
    expect(body.delivery_readiness.orders[0].delivered).toBe(true);
    expect(body.delivery_readiness.orders[1].delivered).toBe(false);
  });

  it("returns 404 when token is invalid", async () => {
    mockPrisma.installation.findUnique.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/public/installer/nonexistent-token",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe("Ce lien installateur n'est plus valide.");
  });

  it("returns milestones array with correct structure", async () => {
    mockPrisma.installation.findUnique.mockResolvedValueOnce(
      makeInstallationWithProject(),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/public/installer/valid-installer-token",
    });

    const body = res.json();
    expect(body.milestones).toBeInstanceOf(Array);
    expect(body.milestones).toHaveLength(5);

    const keys = body.milestones.map((m: { key: string }) => m.key);
    expect(keys).toEqual([
      "order_confirmed",
      "shipment",
      "consolidation",
      "delivery",
      "installation",
    ]);

    // All delivered, consolidation complete → first 4 completed
    expect(body.milestones[0].status).toBe("completed"); // orders confirmed
    expect(body.milestones[2].status).toBe("completed"); // consolidation
    expect(body.milestones[3].status).toBe("completed"); // delivery
    expect(body.milestones[4].status).toBe("pending");   // installation not started
  });

  it("does not expose internal IDs or sensitive data", async () => {
    mockPrisma.installation.findUnique.mockResolvedValueOnce(
      makeInstallationWithProject(),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/public/installer/valid-installer-token",
    });

    const raw = res.body;
    // Internal IDs should not appear
    expect(raw).not.toContain("proj-1");
    expect(raw).not.toContain("inst-1");
    expect(raw).not.toContain("order-a");
    expect(raw).not.toContain("order-b");
    // technician_id is internal, only technician_name should appear
    expect(raw).not.toContain("TECH-IDF-007");
  });

  it("returns consolidation and last_mile data", async () => {
    mockPrisma.installation.findUnique.mockResolvedValueOnce(
      makeInstallationWithProject(),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/public/installer/valid-installer-token",
    });

    const body = res.json();
    expect(body.consolidation).toBeDefined();
    expect(body.consolidation.status).toBe("complete");
    expect(body.consolidation.orders_arrived).toBe(2);
    expect(body.consolidation.orders_required).toBe(2);

    expect(body.last_mile).toBeDefined();
    expect(body.last_mile.status).toBe("delivered");
    expect(body.last_mile.is_partial).toBe(false);
  });

  it("handles null consolidation and last_mile gracefully", async () => {
    const data = makeInstallationWithProject();
    data.project.consolidation = null as any;
    data.project.last_mile = null as any;
    mockPrisma.installation.findUnique.mockResolvedValueOnce(data);

    const res = await app.inject({
      method: "GET",
      url: "/api/public/installer/valid-installer-token",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.consolidation).toBeNull();
    expect(body.last_mile).toBeNull();
  });

  it("does not require JWT authentication (public route)", async () => {
    mockPrisma.installation.findUnique.mockResolvedValueOnce(
      makeInstallationWithProject(),
    );

    // No cookie header at all
    const res = await app.inject({
      method: "GET",
      url: "/api/public/installer/valid-installer-token",
    });

    expect(res.statusCode).toBe(200);
  });
});
