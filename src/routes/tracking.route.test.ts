import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// =============================================================================
// Mocks — avant tout import du serveur
// =============================================================================

const mockPrisma = {
  project: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  notification: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  anomalyRule: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  user: { findUnique: vi.fn() },
  activityLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  order: { findMany: vi.fn(), findFirst: vi.fn() },
  event: { update: vi.fn(), findFirst: vi.fn() },
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
// Tests — Tracking route (public, no JWT required)
// =============================================================================

describe("GET /api/public/tracking/:token", () => {
  it("returns project milestones for valid token", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: "proj-1",
      customer_id: "CLI-DUBOIS-2024",
      project_type: "kitchen",
      status: "active",
      created_at: new Date(),
      tracking_token: "dubois-2024-suivi",
      orders: [
        {
          id: "ord-1",
          erp_order_ref: "ERP-CMD-001",
          status: "confirmed",
          promised_delivery_date: new Date(),
          promised_installation_date: null,
          created_at: new Date(),
          lines: [{ id: "line-1" }],
          shipments: [],
        },
      ],
      consolidation: null,
      last_mile: null,
      installation: null,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/public/tracking/dubois-2024-suivi",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.project_ref).toBe("CLI-DUBOIS-2024");
    expect(body.milestones).toBeDefined();
    expect(Array.isArray(body.milestones)).toBe(true);
    expect(body.milestones.length).toBeGreaterThanOrEqual(5);
  });

  it("returns milestone order_confirmed as completed when all orders confirmed", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: "proj-1",
      customer_id: "CLI-001",
      project_type: "kitchen",
      status: "active",
      created_at: new Date(),
      tracking_token: "token-1",
      orders: [
        {
          id: "ord-1",
          erp_order_ref: "ERP-1",
          status: "confirmed",
          promised_delivery_date: null,
          promised_installation_date: null,
          created_at: new Date(),
          lines: [],
          shipments: [],
        },
      ],
      consolidation: null,
      last_mile: null,
      installation: null,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/public/tracking/token-1",
    });

    const body = res.json();
    const orderMilestone = body.milestones.find((m: any) => m.key === "order_confirmed");
    expect(orderMilestone.status).toBe("completed");
  });

  it("returns 404 for unknown token", async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/public/tracking/invalid-token-xyz",
    });

    expect(res.statusCode).toBe(404);
  });

  it("does not require JWT authentication", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: "proj-1",
      customer_id: "CLI-001",
      project_type: "bathroom",
      status: "active",
      created_at: new Date(),
      tracking_token: "public-token",
      orders: [],
      consolidation: null,
      last_mile: null,
      installation: null,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/public/tracking/public-token",
      // No Cookie header — should still work
    });

    expect(res.statusCode).toBe(200);
  });

  it("includes installation milestone when installation exists", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: "proj-1",
      customer_id: "CLI-001",
      project_type: "kitchen",
      status: "active",
      created_at: new Date(),
      tracking_token: "with-install",
      orders: [],
      consolidation: null,
      last_mile: null,
      installation: {
        id: "inst-1",
        status: "scheduled",
        scheduled_date: new Date(),
        scheduled_slot: null,
        technician_name: "Jean",
        completed_at: null,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/public/tracking/with-install",
    });

    const body = res.json();
    const installMilestone = body.milestones.find((m: any) => m.key === "installation");
    expect(installMilestone).toBeDefined();
    expect(installMilestone.status).toBe("in_progress");
  });

  it("milestone shows partial_approved consolidation as completed", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: "proj-1",
      customer_id: "CLI-001",
      project_type: "kitchen",
      status: "active",
      created_at: new Date(),
      tracking_token: "partial-approved-token",
      orders: [],
      consolidation: {
        id: "cons-1",
        status: "partial_approved",
        orders_arrived: ["ord-1"],
        orders_required: ["ord-1", "ord-2"],
        estimated_complete_date: new Date("2026-03-01"),
        partial_delivery_approved: true,
      },
      last_mile: null,
      installation: null,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/public/tracking/partial-approved-token",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const consolMilestone = body.milestones.find((m: any) => m.key === "consolidation");
    expect(consolMilestone).toBeDefined();
    expect(consolMilestone.status).toBe("completed");
  });

  it("handles shipments with null estimated_arrival without error", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: "proj-1",
      customer_id: "CLI-001",
      project_type: "kitchen",
      status: "active",
      created_at: new Date(),
      tracking_token: "null-eta-token",
      orders: [
        {
          id: "ord-1",
          erp_order_ref: "ERP-1",
          status: "confirmed",
          promised_delivery_date: null,
          promised_installation_date: null,
          created_at: new Date(),
          lines: [{ id: "line-1" }],
          shipments: [
            {
              id: "ship-1",
              carrier: "DHL",
              carrier_tracking_ref: "DHL-001",
              status: "in_transit",
              estimated_arrival: null,
              actual_arrival: null,
            },
            {
              id: "ship-2",
              carrier: "FedEx",
              carrier_tracking_ref: "FDX-001",
              status: "dispatched",
              estimated_arrival: new Date("2026-03-10"),
              actual_arrival: null,
            },
          ],
        },
      ],
      consolidation: null,
      last_mile: null,
      installation: null,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/public/tracking/null-eta-token",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Shipment milestone should exist and not error out
    const shipmentMilestone = body.milestones.find((m: any) => m.key === "shipment");
    expect(shipmentMilestone).toBeDefined();
    expect(shipmentMilestone.status).toBe("in_progress");
  });

  it("includes last_mile milestone with scheduled_date as in_progress", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: "proj-1",
      customer_id: "CLI-001",
      project_type: "kitchen",
      status: "active",
      created_at: new Date(),
      tracking_token: "last-mile-token",
      orders: [],
      consolidation: null,
      last_mile: {
        id: "lm-1",
        status: "scheduled",
        scheduled_date: new Date("2026-03-15"),
        scheduled_slot: "morning",
        delivered_at: null,
        is_partial: false,
      },
      installation: null,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/public/tracking/last-mile-token",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const deliveryMilestone = body.milestones.find((m: any) => m.key === "delivery");
    expect(deliveryMilestone).toBeDefined();
    expect(deliveryMilestone.status).toBe("in_progress");
    expect(deliveryMilestone.date).toBeTruthy();
  });

  it("includes installation milestone with scheduled_date", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      id: "proj-1",
      customer_id: "CLI-001",
      project_type: "kitchen",
      status: "active",
      created_at: new Date(),
      tracking_token: "install-scheduled-token",
      orders: [],
      consolidation: null,
      last_mile: null,
      installation: {
        id: "inst-1",
        status: "scheduled",
        scheduled_date: new Date("2026-04-01"),
        scheduled_slot: "afternoon",
        technician_name: "Pierre",
        completed_at: null,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/public/tracking/install-scheduled-token",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const installMilestone = body.milestones.find((m: any) => m.key === "installation");
    expect(installMilestone).toBeDefined();
    expect(installMilestone.status).toBe("in_progress");
    expect(installMilestone.date).toBeTruthy();
    // Verify installation details in the response
    expect(body.installation).toBeDefined();
    expect(body.installation.scheduled_date).toBeTruthy();
    expect(body.installation.technician_name).toBe("Pierre");
  });
});
