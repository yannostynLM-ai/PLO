import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks — must be declared before any import of the modules under test
// =============================================================================

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    projectExternalRef: { findUnique: vi.fn(), findFirst: vi.fn() },
    project: { findUnique: vi.fn() },
    event: { findUnique: vi.fn(), create: vi.fn() },
    order: { findFirst: vi.fn() },
    step: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("../lib/queue.js", () => ({
  eventQueue: { add: vi.fn(), close: vi.fn() },
  deadLetterQueue: { add: vi.fn(), close: vi.fn() },
}));

import { deriveSeverity, ingestEvent } from "./event.service.js";
import { prisma } from "../lib/prisma.js";
import { eventQueue, deadLetterQueue } from "../lib/queue.js";
import type { NormalizedEvent } from "../adapters/types.js";

// =============================================================================
// Helpers
// =============================================================================

const mockPrisma = prisma as unknown as {
  projectExternalRef: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  project: { findUnique: ReturnType<typeof vi.fn> };
  event: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  order: { findFirst: ReturnType<typeof vi.fn> };
};

const mockEventQueue = eventQueue as unknown as {
  add: ReturnType<typeof vi.fn>;
};

const mockDeadLetterQueue = deadLetterQueue as unknown as {
  add: ReturnType<typeof vi.fn>;
};

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    source: "erp" as NormalizedEvent["source"],
    source_ref: "EVT-001",
    event_type: "order.confirmed",
    project_ref: "PRJ-REF-001",
    occurred_at: new Date("2025-06-01T10:00:00Z"),
    payload: { foo: "bar" },
    ...overrides,
  };
}

// =============================================================================
// Tests unitaires — deriveSeverity()
// =============================================================================

describe("deriveSeverity", () => {
  it("returns critical for stock.shortage", () => {
    expect(deriveSeverity("stock.shortage")).toBe("critical");
  });

  it("returns critical for picking.discrepancy", () => {
    expect(deriveSeverity("picking.discrepancy")).toBe("critical");
  });

  it("returns critical for shipment.exception", () => {
    expect(deriveSeverity("shipment.exception")).toBe("critical");
  });

  it("returns critical for lastmile.failed", () => {
    expect(deriveSeverity("lastmile.failed")).toBe("critical");
  });

  it("returns critical for installation.issue", () => {
    expect(deriveSeverity("installation.issue")).toBe("critical");
  });

  it("returns warning for stock.partial", () => {
    expect(deriveSeverity("stock.partial")).toBe("warning");
  });

  it("returns warning for shipment.eta_updated", () => {
    expect(deriveSeverity("shipment.eta_updated")).toBe("warning");
  });

  it("returns warning for installation.rescheduled", () => {
    expect(deriveSeverity("installation.rescheduled")).toBe("warning");
  });

  it("returns info for order.confirmed", () => {
    expect(deriveSeverity("order.confirmed")).toBe("info");
  });

  it("returns info for unknown event_type", () => {
    expect(deriveSeverity("some.unknown.event")).toBe("info");
  });

  it("returns info for inspiration.started", () => {
    expect(deriveSeverity("inspiration.started")).toBe("info");
  });
});

// =============================================================================
// Tests unitaires — ingestEvent()
// =============================================================================

describe("ingestEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Dead letter when project unresolved
  // --------------------------------------------------------------------------
  it("returns dead_letter when project is unresolved and adds to DLQ", async () => {
    mockPrisma.projectExternalRef.findUnique.mockResolvedValue(null);
    mockPrisma.projectExternalRef.findFirst.mockResolvedValue(null);
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const event = makeEvent();
    const result = await ingestEvent(event);

    expect(result.status).toBe("dead_letter");
    expect(result.message).toContain("PRJ-REF-001");
    expect(mockDeadLetterQueue.add).toHaveBeenCalledOnce();
    expect(mockDeadLetterQueue.add).toHaveBeenCalledWith("unresolved", {
      source: "erp",
      source_ref: "EVT-001",
      event_type: "order.confirmed",
      project_ref: "PRJ-REF-001",
      occurred_at: event.occurred_at.toISOString(),
      payload: { foo: "bar" },
    });
  });

  // --------------------------------------------------------------------------
  // 2. Duplicate detection
  // --------------------------------------------------------------------------
  it("returns duplicate when event with same source+source_ref exists", async () => {
    mockPrisma.projectExternalRef.findUnique.mockResolvedValue({
      project: { id: "proj-1" },
    });
    mockPrisma.event.findUnique.mockResolvedValue({ id: "existing-evt-id" });

    const result = await ingestEvent(makeEvent());

    expect(result.status).toBe("duplicate");
    expect(result.event_id).toBe("existing-evt-id");
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 3. Created with event_id and project_id
  // --------------------------------------------------------------------------
  it("returns created with event_id and project_id for new event", async () => {
    mockPrisma.projectExternalRef.findUnique.mockResolvedValue({
      project: { id: "proj-1" },
    });
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "new-evt-id" });
    mockEventQueue.add.mockResolvedValue(undefined);

    const result = await ingestEvent(makeEvent());

    expect(result.status).toBe("created");
    expect(result.event_id).toBe("new-evt-id");
    expect(result.project_id).toBe("proj-1");
  });

  // --------------------------------------------------------------------------
  // 4. Resolves project via exact source+ref match
  // --------------------------------------------------------------------------
  it("resolves project via exact source+ref match (projectExternalRef.findUnique)", async () => {
    mockPrisma.projectExternalRef.findUnique.mockResolvedValue({
      project: { id: "proj-exact" },
    });
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-1" });
    mockEventQueue.add.mockResolvedValue(undefined);

    const result = await ingestEvent(makeEvent());

    expect(result.status).toBe("created");
    expect(result.project_id).toBe("proj-exact");
    expect(mockPrisma.projectExternalRef.findUnique).toHaveBeenCalledWith({
      where: { source_ref: { source: "erp", ref: "PRJ-REF-001" } },
      select: { project: { select: { id: true } } },
    });
    // findFirst should not be called when findUnique returns a result
    expect(mockPrisma.projectExternalRef.findFirst).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 5. Resolves project via cross-source fallback
  // --------------------------------------------------------------------------
  it("resolves project via cross-source fallback (findFirst)", async () => {
    mockPrisma.projectExternalRef.findUnique.mockResolvedValue(null);
    mockPrisma.projectExternalRef.findFirst.mockResolvedValue({
      project: { id: "proj-fallback" },
    });
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-2" });
    mockEventQueue.add.mockResolvedValue(undefined);

    const result = await ingestEvent(makeEvent());

    expect(result.status).toBe("created");
    expect(result.project_id).toBe("proj-fallback");
    expect(mockPrisma.projectExternalRef.findFirst).toHaveBeenCalledWith({
      where: { ref: "PRJ-REF-001" },
      select: { project: { select: { id: true } } },
    });
  });

  // --------------------------------------------------------------------------
  // 6. Resolves project via direct project_id UUID
  // --------------------------------------------------------------------------
  it("resolves project via direct project_id UUID (project.findUnique)", async () => {
    mockPrisma.projectExternalRef.findUnique.mockResolvedValue(null);
    mockPrisma.projectExternalRef.findFirst.mockResolvedValue(null);
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-uuid-direct" });
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-3" });
    mockEventQueue.add.mockResolvedValue(undefined);

    const event = makeEvent({ project_ref: "proj-uuid-direct" });
    const result = await ingestEvent(event);

    expect(result.status).toBe("created");
    expect(result.project_id).toBe("proj-uuid-direct");
    expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: "proj-uuid-direct" },
      select: { id: true },
    });
  });

  // --------------------------------------------------------------------------
  // 7. Resolves order_id when order_ref matches erp_order_ref
  // --------------------------------------------------------------------------
  it("resolves order_id when order_ref matches erp_order_ref", async () => {
    mockPrisma.projectExternalRef.findUnique.mockResolvedValue({
      project: { id: "proj-1" },
    });
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue({ id: "order-42" });
    mockPrisma.event.create.mockResolvedValue({ id: "evt-4" });
    mockEventQueue.add.mockResolvedValue(undefined);

    const event = makeEvent({ order_ref: "ORD-123" });
    const result = await ingestEvent(event);

    expect(result.status).toBe("created");
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        project_id: "proj-1",
        OR: [
          { erp_order_ref: "ORD-123" },
          { ecommerce_order_ref: "ORD-123" },
        ],
      },
      select: { id: true },
    });
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order_id: "order-42" }),
      })
    );
  });

  // --------------------------------------------------------------------------
  // 8. Sets order_id to null when order_ref has no match
  // --------------------------------------------------------------------------
  it("sets order_id to null when order_ref has no match", async () => {
    mockPrisma.projectExternalRef.findUnique.mockResolvedValue({
      project: { id: "proj-1" },
    });
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-5" });
    mockEventQueue.add.mockResolvedValue(undefined);

    const event = makeEvent({ order_ref: "NO-MATCH" });
    await ingestEvent(event);

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order_id: null }),
      })
    );
  });

  // --------------------------------------------------------------------------
  // 9. Sets order_id to null when no order_ref provided
  // --------------------------------------------------------------------------
  it("sets order_id to null when no order_ref provided", async () => {
    mockPrisma.projectExternalRef.findUnique.mockResolvedValue({
      project: { id: "proj-1" },
    });
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({ id: "evt-6" });
    mockEventQueue.add.mockResolvedValue(undefined);

    const event = makeEvent();
    // Ensure no order_ref
    delete event.order_ref;
    await ingestEvent(event);

    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order_id: null }),
      })
    );
  });

  // --------------------------------------------------------------------------
  // 10. Enqueues event with correct jobData after creation
  // --------------------------------------------------------------------------
  it("enqueues event with correct jobData after creation", async () => {
    mockPrisma.projectExternalRef.findUnique.mockResolvedValue({
      project: { id: "proj-1" },
    });
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.order.findFirst.mockResolvedValue({ id: "order-99" });
    mockPrisma.event.create.mockResolvedValue({ id: "created-evt-id" });
    mockEventQueue.add.mockResolvedValue(undefined);

    const event = makeEvent({ order_ref: "ORD-99" });
    await ingestEvent(event);

    expect(mockEventQueue.add).toHaveBeenCalledOnce();
    expect(mockEventQueue.add).toHaveBeenCalledWith(
      "order.confirmed",
      {
        eventId: "created-evt-id",
        projectId: "proj-1",
        orderId: "order-99",
        installationId: null,
        eventType: "order.confirmed",
        source: "erp",
        payload: { foo: "bar" },
      },
      { jobId: "created-evt-id" }
    );
  });
});
