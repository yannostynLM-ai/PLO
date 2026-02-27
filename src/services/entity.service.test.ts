import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    order: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    orderLine: { createMany: vi.fn(), updateMany: vi.fn() },
    shipment: { upsert: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    consolidation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    lastMileDelivery: { upsert: vi.fn(), updateMany: vi.fn() },
    project: { findUnique: vi.fn(), update: vi.fn() },
    step: { updateMany: vi.fn() },
  },
}));

vi.mock("../lib/activity.js", () => ({ logActivity: vi.fn() }));

import { prisma } from "../lib/prisma.js";
import { logActivity } from "../lib/activity.js";
import {
  handleOrderConfirmed,
  handleStockShortage,
  handleStockCheckOk,
  handleShipmentDispatched,
  handleShipmentEtaUpdated,
  handleShipmentArrivedAtStation,
  handleConsolidationComplete,
  handleConsolidationPartialApproved,
  handleLastmileScheduled,
  handleLastmileDelivered,
  applyEntityUpdates,
} from "./entity.service.js";

// Cast typed mocks
const mockOrder = prisma.order as { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
const mockOrderLine = prisma.orderLine as { createMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
const mockShipment = prisma.shipment as { upsert: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
const mockConsolidation = prisma.consolidation as { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
const mockLastMile = prisma.lastMileDelivery as { upsert: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
const mockProject = prisma.project as { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
const mockStep = prisma.step as { updateMany: ReturnType<typeof vi.fn> };
const mockLogActivity = logActivity as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// handleOrderConfirmed
// =============================================================================
describe("handleOrderConfirmed", () => {
  it("returns null when erp_order_ref is missing", async () => {
    const result = await handleOrderConfirmed("proj-1", {});
    expect(result).toBeNull();
    expect(mockOrder.findFirst).not.toHaveBeenCalled();
    expect(mockOrder.create).not.toHaveBeenCalled();
  });

  it("updates existing order status to confirmed", async () => {
    mockOrder.findFirst.mockResolvedValue({ id: "ord-1" });
    mockOrder.update.mockResolvedValue({ id: "ord-1" });

    const result = await handleOrderConfirmed("proj-1", { erp_order_ref: "REF-1" });

    expect(result).toBe("ord-1");
    expect(mockOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord-1" },
        data: expect.objectContaining({ status: "confirmed" }),
      }),
    );
    expect(mockOrder.create).not.toHaveBeenCalled();
  });

  it("creates new order with lines", async () => {
    mockOrder.findFirst.mockResolvedValue(null);
    mockOrder.create.mockResolvedValue({ id: "ord-new" });
    mockConsolidation.findUnique.mockResolvedValue(null);
    mockConsolidation.create.mockResolvedValue({});
    mockOrderLine.createMany.mockResolvedValue({ count: 1 });

    const result = await handleOrderConfirmed("proj-1", {
      erp_order_ref: "REF-1",
      lines: [{ sku: "SKU-A", label: "Item A", qty: 2, unit_price: 100 }],
    });

    expect(result).toBe("ord-new");
    expect(mockOrderLine.createMany).toHaveBeenCalledWith({
      data: [
        {
          order_id: "ord-new",
          sku: "SKU-A",
          label: "Item A",
          quantity: 2,
          unit_price: 100,
          installation_required: false,
        },
      ],
    });
  });

  it("creates consolidation when none exists", async () => {
    mockOrder.findFirst.mockResolvedValue(null);
    mockOrder.create.mockResolvedValue({ id: "ord-new" });
    mockConsolidation.findUnique.mockResolvedValue(null);
    mockConsolidation.create.mockResolvedValue({});

    await handleOrderConfirmed("proj-1", { erp_order_ref: "REF-1" });

    expect(mockConsolidation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        project_id: "proj-1",
        orders_required: ["ord-new"],
        orders_arrived: [],
        status: "waiting",
      }),
    });
  });

  it("updates consolidation orders_required when exists", async () => {
    mockOrder.findFirst.mockResolvedValue(null);
    mockOrder.create.mockResolvedValue({ id: "ord-new" });
    mockConsolidation.findUnique.mockResolvedValue({ id: "cons-1" });
    mockConsolidation.update.mockResolvedValue({});

    await handleOrderConfirmed("proj-1", { erp_order_ref: "REF-1" });

    expect(mockConsolidation.update).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      data: expect.objectContaining({
        orders_required: { push: "ord-new" },
      }),
    });
    expect(mockConsolidation.create).not.toHaveBeenCalled();
  });

  it("skips createMany when no lines in payload", async () => {
    mockOrder.findFirst.mockResolvedValue(null);
    mockOrder.create.mockResolvedValue({ id: "ord-new" });
    mockConsolidation.findUnique.mockResolvedValue(null);
    mockConsolidation.create.mockResolvedValue({});

    await handleOrderConfirmed("proj-1", { erp_order_ref: "REF-1" });

    expect(mockOrderLine.createMany).not.toHaveBeenCalled();
  });

  it("maps delivery_address and optional fields", async () => {
    mockOrder.findFirst.mockResolvedValue(null);
    mockOrder.create.mockResolvedValue({ id: "ord-new" });
    mockConsolidation.findUnique.mockResolvedValue(null);
    mockConsolidation.create.mockResolvedValue({});

    await handleOrderConfirmed("proj-1", {
      erp_order_ref: "REF-1",
      delivery_address: { street: "1 rue" },
      installation_required: true,
      lead_time_days: 14,
      promised_delivery_date: "2026-03-01T00:00:00Z",
    });

    expect(mockOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        project_id: "proj-1",
        erp_order_ref: "REF-1",
        status: "confirmed",
        delivery_address: { street: "1 rue" },
        installation_required: true,
        lead_time_days: 14,
        promised_delivery_date: new Date("2026-03-01T00:00:00Z"),
      }),
    });
  });
});

// =============================================================================
// handleStockShortage
// =============================================================================
describe("handleStockShortage", () => {
  it("no-op when no SKUs provided", async () => {
    await handleStockShortage("proj-1", "ord-1", {});
    expect(mockOrderLine.updateMany).not.toHaveBeenCalled();
  });

  it("updates via multi-SKU shortage_skus array", async () => {
    mockOrderLine.updateMany.mockResolvedValue({ count: 2 });

    await handleStockShortage("proj-1", "ord-1", {
      shortage_skus: ["SKU-1", "SKU-2"],
    });

    expect(mockOrderLine.updateMany).toHaveBeenCalledWith({
      where: { order_id: "ord-1", sku: { in: ["SKU-1", "SKU-2"] } },
      data: expect.objectContaining({ stock_status: "shortage" }),
    });
  });

  it("falls back to single sku field", async () => {
    mockOrderLine.updateMany.mockResolvedValue({ count: 1 });

    await handleStockShortage("proj-1", "ord-1", { sku: "SKU-X" });

    expect(mockOrderLine.updateMany).toHaveBeenCalledWith({
      where: { order_id: "ord-1", sku: { in: ["SKU-X"] } },
      data: expect.objectContaining({ stock_status: "shortage" }),
    });
  });

  it("uses project-wide where when orderId is null", async () => {
    mockOrderLine.updateMany.mockResolvedValue({ count: 1 });

    await handleStockShortage("proj-1", null, { sku: "SKU-X" });

    expect(mockOrderLine.updateMany).toHaveBeenCalledWith({
      where: { order: { project_id: "proj-1" }, sku: { in: ["SKU-X"] } },
      data: expect.objectContaining({ stock_status: "shortage" }),
    });
  });
});

// =============================================================================
// handleStockCheckOk
// =============================================================================
describe("handleStockCheckOk", () => {
  it("resets stock_status with orderId", async () => {
    mockOrderLine.updateMany.mockResolvedValue({ count: 1 });

    await handleStockCheckOk("ord-1", "proj-1");

    expect(mockOrderLine.updateMany).toHaveBeenCalledWith({
      where: { order_id: "ord-1" },
      data: expect.objectContaining({ stock_status: "available" }),
    });
  });

  it("resets stock_status with projectId when orderId null", async () => {
    mockOrderLine.updateMany.mockResolvedValue({ count: 1 });

    await handleStockCheckOk(null, "proj-1");

    expect(mockOrderLine.updateMany).toHaveBeenCalledWith({
      where: { order: { project_id: "proj-1" } },
      data: expect.objectContaining({ stock_status: "available" }),
    });
  });
});

// =============================================================================
// handleShipmentDispatched
// =============================================================================
describe("handleShipmentDispatched", () => {
  it("returns early when shipment_id is missing", async () => {
    await handleShipmentDispatched("ord-1", "proj-1", {});
    expect(mockShipment.upsert).not.toHaveBeenCalled();
  });

  it("returns early when orderId is null", async () => {
    await handleShipmentDispatched(null, "proj-1", { shipment_id: "SHP-1" });
    expect(mockShipment.upsert).not.toHaveBeenCalled();
  });

  it("upserts shipment with full payload", async () => {
    mockShipment.upsert.mockResolvedValue({});

    await handleShipmentDispatched("ord-1", "proj-1", {
      shipment_id: "SHP-1",
      carrier: "DHL",
      carrier_tracking_ref: "TR-123",
      leg_number: 2,
      origin_type: "warehouse",
      origin_ref: "WH-01",
      destination_station_id: "STN-01",
      estimated_arrival: "2026-03-15T00:00:00Z",
    });

    expect(mockShipment.upsert).toHaveBeenCalledWith({
      where: { id: "SHP-1" },
      create: expect.objectContaining({
        id: "SHP-1",
        order_id: "ord-1",
        project_id: "proj-1",
        oms_ref: "SHP-1",
        leg_number: 2,
        origin_type: "warehouse",
        origin_ref: "WH-01",
        destination_station_id: "STN-01",
        carrier: "DHL",
        carrier_tracking_ref: "TR-123",
        status: "dispatched",
        estimated_arrival: new Date("2026-03-15T00:00:00Z"),
      }),
      update: expect.objectContaining({
        status: "dispatched",
      }),
    });
  });
});

// =============================================================================
// handleShipmentEtaUpdated
// =============================================================================
describe("handleShipmentEtaUpdated", () => {
  it("returns early when shipment_id missing", async () => {
    await handleShipmentEtaUpdated({});
    expect(mockShipment.updateMany).not.toHaveBeenCalled();
    expect(mockShipment.findFirst).not.toHaveBeenCalled();
  });

  it("updates ETA and recalculates consolidation date", async () => {
    mockShipment.updateMany.mockResolvedValue({ count: 1 });
    mockShipment.findFirst.mockResolvedValue({ project_id: "proj-1" });
    mockShipment.findMany.mockResolvedValue([
      { estimated_arrival: new Date("2026-03-20T00:00:00Z") },
    ]);
    mockConsolidation.updateMany.mockResolvedValue({ count: 1 });

    await handleShipmentEtaUpdated({
      shipment_id: "SHP-1",
      new_eta: "2026-03-20T00:00:00Z",
    });

    expect(mockShipment.updateMany).toHaveBeenCalledWith({
      where: { oms_ref: "SHP-1" },
      data: expect.objectContaining({
        estimated_arrival: new Date("2026-03-20T00:00:00Z"),
      }),
    });
    expect(mockConsolidation.updateMany).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      data: expect.objectContaining({
        estimated_complete_date: new Date("2026-03-20T00:00:00Z"),
      }),
    });
  });

  it("returns early when no pending shipments", async () => {
    mockShipment.updateMany.mockResolvedValue({ count: 1 });
    mockShipment.findFirst.mockResolvedValue({ project_id: "proj-1" });
    mockShipment.findMany.mockResolvedValue([]);

    await handleShipmentEtaUpdated({
      shipment_id: "SHP-1",
      new_eta: "2026-03-20T00:00:00Z",
    });

    expect(mockConsolidation.updateMany).not.toHaveBeenCalled();
  });
});

// =============================================================================
// handleShipmentArrivedAtStation
// =============================================================================
describe("handleShipmentArrivedAtStation", () => {
  it("updates shipment status to arrived", async () => {
    mockShipment.updateMany.mockResolvedValue({ count: 1 });
    mockConsolidation.findUnique.mockResolvedValue({
      orders_arrived: [],
      orders_required: ["ord-1"],
    });
    mockConsolidation.update.mockResolvedValue({});

    await handleShipmentArrivedAtStation("proj-1", "ord-1", { shipment_id: "SHP-1" });

    expect(mockShipment.updateMany).toHaveBeenCalledWith({
      where: { oms_ref: "SHP-1" },
      data: expect.objectContaining({ status: "arrived" }),
    });
    expect(mockConsolidation.update).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      data: expect.objectContaining({
        orders_arrived: ["ord-1"],
        status: "complete",
      }),
    });
  });

  it("sets in_progress when not all orders arrived", async () => {
    mockShipment.updateMany.mockResolvedValue({ count: 1 });
    mockConsolidation.findUnique.mockResolvedValue({
      orders_arrived: [],
      orders_required: ["ord-1", "ord-2"],
    });
    mockConsolidation.update.mockResolvedValue({});

    await handleShipmentArrivedAtStation("proj-1", "ord-1", { shipment_id: "SHP-1" });

    expect(mockConsolidation.update).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      data: expect.objectContaining({
        orders_arrived: ["ord-1"],
        status: "in_progress",
      }),
    });
  });

  it("returns early when orderId is null", async () => {
    mockShipment.updateMany.mockResolvedValue({ count: 1 });

    await handleShipmentArrivedAtStation("proj-1", null, { shipment_id: "SHP-1" });

    expect(mockConsolidation.findUnique).not.toHaveBeenCalled();
  });

  it("returns early when orderId already in orders_arrived", async () => {
    mockShipment.updateMany.mockResolvedValue({ count: 1 });
    mockConsolidation.findUnique.mockResolvedValue({
      orders_arrived: ["ord-1"],
      orders_required: ["ord-1"],
    });

    await handleShipmentArrivedAtStation("proj-1", "ord-1", { shipment_id: "SHP-1" });

    expect(mockConsolidation.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// handleConsolidationComplete
// =============================================================================
describe("handleConsolidationComplete", () => {
  it("sets consolidation complete and updates step", async () => {
    mockConsolidation.updateMany.mockResolvedValue({ count: 1 });
    mockStep.updateMany.mockResolvedValue({ count: 1 });

    await handleConsolidationComplete("proj-1");

    expect(mockConsolidation.updateMany).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      data: expect.objectContaining({ status: "complete" }),
    });
    expect(mockStep.updateMany).toHaveBeenCalledWith({
      where: { project_id: "proj-1", step_type: "consolidation_in_progress" },
      data: expect.objectContaining({ status: "completed" }),
    });
  });
});

// =============================================================================
// handleConsolidationPartialApproved
// =============================================================================
describe("handleConsolidationPartialApproved", () => {
  it("sets partial_approved with approval metadata", async () => {
    mockConsolidation.updateMany.mockResolvedValue({ count: 1 });

    await handleConsolidationPartialApproved("proj-1", {
      partial_approved_by: { customer: true },
    });

    expect(mockConsolidation.updateMany).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      data: expect.objectContaining({
        status: "partial_approved",
        partial_delivery_approved: true,
        partial_approved_by: { customer: true },
      }),
    });
  });
});

// =============================================================================
// handleLastmileScheduled
// =============================================================================
describe("handleLastmileScheduled", () => {
  it("upserts lastmile delivery", async () => {
    mockConsolidation.findUnique.mockResolvedValue({ id: "cons-1" });
    mockLastMile.upsert.mockResolvedValue({});

    await handleLastmileScheduled("proj-1", {
      lastmile_id: "LM-1",
      scheduled_date: "2026-04-01T00:00:00Z",
      carrier: "Colissimo",
    });

    expect(mockLastMile.upsert).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      create: expect.objectContaining({
        project_id: "proj-1",
        consolidation_id: "cons-1",
        tms_delivery_ref: "LM-1",
        carrier: "Colissimo",
        status: "scheduled",
        scheduled_date: new Date("2026-04-01T00:00:00Z"),
      }),
      update: expect.objectContaining({
        status: "scheduled",
        scheduled_date: new Date("2026-04-01T00:00:00Z"),
      }),
    });
  });

  it("skips upsert when lastmile_id missing", async () => {
    mockConsolidation.findUnique.mockResolvedValue({ id: "cons-1" });

    await handleLastmileScheduled("proj-1", {});

    expect(mockLastMile.upsert).not.toHaveBeenCalled();
  });
});

// =============================================================================
// handleLastmileDelivered
// =============================================================================
describe("handleLastmileDelivered", () => {
  it("sets delivered status", async () => {
    mockLastMile.updateMany.mockResolvedValue({ count: 1 });

    await handleLastmileDelivered("proj-1", "lastmile.delivered", {});

    expect(mockLastMile.updateMany).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      data: expect.objectContaining({ status: "delivered" }),
    });
  });

  it("sets partial_delivered status", async () => {
    mockLastMile.updateMany.mockResolvedValue({ count: 1 });

    await handleLastmileDelivered("proj-1", "lastmile.partial_delivered", {});

    expect(mockLastMile.updateMany).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      data: expect.objectContaining({
        status: "partial_delivered",
        is_partial: true,
      }),
    });
  });

  it("sets failed status", async () => {
    mockLastMile.updateMany.mockResolvedValue({ count: 1 });

    await handleLastmileDelivered("proj-1", "lastmile.failed", {});

    expect(mockLastMile.updateMany).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      data: expect.objectContaining({
        status: "failed",
        delivered_at: undefined,
      }),
    });
  });
});

// =============================================================================
// applyEntityUpdates
// =============================================================================
describe("applyEntityUpdates", () => {
  it("routes order.confirmed to handleOrderConfirmed", async () => {
    mockOrder.findFirst.mockResolvedValue(null);
    mockOrder.create.mockResolvedValue({ id: "ord-1" });
    mockConsolidation.findUnique.mockResolvedValue(null);
    mockConsolidation.create.mockResolvedValue({});

    await applyEntityUpdates({
      event_type: "order.confirmed",
      project_id: "proj-1",
      order_id: null,
      installation_id: null,
      payload: { erp_order_ref: "REF-1" },
    });

    expect(mockOrder.findFirst).toHaveBeenCalled();
  });

  it("routes lastmile.delivered and triggers maybeAutoCloseProject", async () => {
    mockLastMile.updateMany.mockResolvedValue({ count: 1 });
    mockProject.findUnique.mockResolvedValue({
      id: "proj-1",
      status: "active",
      customer_id: "CUST-1",
      last_mile: { status: "delivered" },
      installation: null,
    });
    mockProject.update.mockResolvedValue({});

    await applyEntityUpdates({
      event_type: "lastmile.delivered",
      project_id: "proj-1",
      order_id: null,
      installation_id: null,
      payload: {},
    });

    expect(mockProject.update).toHaveBeenCalledWith({
      where: { id: "proj-1" },
      data: expect.objectContaining({ status: "completed" }),
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project_status_changed",
        entity_type: "project",
        entity_id: "proj-1",
        entity_label: "CUST-1",
        operator_name: "system",
        details: expect.objectContaining({ from: "active", to: "completed", trigger: "auto" }),
      }),
    );
  });

  it("no-op for unknown event_type", async () => {
    await applyEntityUpdates({
      event_type: "unknown.event",
      project_id: "proj-1",
      order_id: null,
      installation_id: null,
      payload: {},
    });

    expect(mockOrder.findFirst).not.toHaveBeenCalled();
    expect(mockOrder.create).not.toHaveBeenCalled();
    expect(mockOrder.update).not.toHaveBeenCalled();
    expect(mockOrderLine.createMany).not.toHaveBeenCalled();
    expect(mockOrderLine.updateMany).not.toHaveBeenCalled();
    expect(mockShipment.upsert).not.toHaveBeenCalled();
    expect(mockShipment.updateMany).not.toHaveBeenCalled();
    expect(mockConsolidation.updateMany).not.toHaveBeenCalled();
    expect(mockLastMile.upsert).not.toHaveBeenCalled();
    expect(mockLastMile.updateMany).not.toHaveBeenCalled();
    expect(mockProject.findUnique).not.toHaveBeenCalled();
    expect(mockProject.update).not.toHaveBeenCalled();
  });

  // ---- new switch-arm coverage tests ----

  it("routes stock.shortage to handleStockShortage", async () => {
    mockOrderLine.updateMany.mockResolvedValue({ count: 1 });

    await applyEntityUpdates({
      event_type: "stock.shortage",
      project_id: "proj-1",
      order_id: "ord-1",
      installation_id: null,
      payload: { shortage_skus: ["SKU-A"] },
    });

    expect(mockOrderLine.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stock_status: "shortage" }),
      }),
    );
  });

  it("routes stock.partial to the same handleStockShortage handler", async () => {
    mockOrderLine.updateMany.mockResolvedValue({ count: 1 });

    await applyEntityUpdates({
      event_type: "stock.partial",
      project_id: "proj-1",
      order_id: "ord-1",
      installation_id: null,
      payload: { sku: "SKU-B" },
    });

    expect(mockOrderLine.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stock_status: "shortage" }),
      }),
    );
  });

  it("routes stock.check_ok to handleStockCheckOk", async () => {
    mockOrderLine.updateMany.mockResolvedValue({ count: 1 });

    await applyEntityUpdates({
      event_type: "stock.check_ok",
      project_id: "proj-1",
      order_id: "ord-1",
      installation_id: null,
      payload: {},
    });

    expect(mockOrderLine.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stock_status: "available" }),
      }),
    );
  });

  it("routes shipment.dispatched to handleShipmentDispatched", async () => {
    mockShipment.upsert.mockResolvedValue({});

    await applyEntityUpdates({
      event_type: "shipment.dispatched",
      project_id: "proj-1",
      order_id: "ord-1",
      installation_id: null,
      payload: { shipment_id: "SHP-1", carrier: "DHL" },
    });

    expect(mockShipment.upsert).toHaveBeenCalled();
  });

  it("routes shipment.eta_updated to handleShipmentEtaUpdated", async () => {
    mockShipment.updateMany.mockResolvedValue({ count: 1 });
    mockShipment.findFirst.mockResolvedValue({ project_id: "proj-1" });
    mockShipment.findMany.mockResolvedValue([
      { estimated_arrival: new Date("2026-04-01T00:00:00Z") },
    ]);
    mockConsolidation.updateMany.mockResolvedValue({ count: 1 });

    await applyEntityUpdates({
      event_type: "shipment.eta_updated",
      project_id: "proj-1",
      order_id: null,
      installation_id: null,
      payload: { shipment_id: "SHP-1", new_eta: "2026-04-01T00:00:00Z" },
    });

    expect(mockShipment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { oms_ref: "SHP-1" },
      }),
    );
  });

  it("routes shipment.arrived_at_station to handleShipmentArrivedAtStation", async () => {
    mockShipment.updateMany.mockResolvedValue({ count: 1 });
    mockConsolidation.findUnique.mockResolvedValue({
      orders_arrived: [],
      orders_required: ["ord-1"],
    });
    mockConsolidation.update.mockResolvedValue({});

    await applyEntityUpdates({
      event_type: "shipment.arrived_at_station",
      project_id: "proj-1",
      order_id: "ord-1",
      installation_id: null,
      payload: { shipment_id: "SHP-1" },
    });

    expect(mockShipment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { oms_ref: "SHP-1" },
        data: expect.objectContaining({ status: "arrived" }),
      }),
    );
    expect(mockConsolidation.update).toHaveBeenCalled();
  });

  it("routes consolidation.complete to handleConsolidationComplete", async () => {
    mockConsolidation.updateMany.mockResolvedValue({ count: 1 });
    mockStep.updateMany.mockResolvedValue({ count: 1 });

    await applyEntityUpdates({
      event_type: "consolidation.complete",
      project_id: "proj-1",
      order_id: null,
      installation_id: null,
      payload: {},
    });

    expect(mockConsolidation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { project_id: "proj-1" },
        data: expect.objectContaining({ status: "complete" }),
      }),
    );
    expect(mockStep.updateMany).toHaveBeenCalled();
  });

  it("routes consolidation.partial_approved to handleConsolidationPartialApproved", async () => {
    mockConsolidation.updateMany.mockResolvedValue({ count: 1 });

    await applyEntityUpdates({
      event_type: "consolidation.partial_approved",
      project_id: "proj-1",
      order_id: null,
      installation_id: null,
      payload: { partial_approved_by: { customer: true } },
    });

    expect(mockConsolidation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { project_id: "proj-1" },
        data: expect.objectContaining({ status: "partial_approved" }),
      }),
    );
  });

  it("routes lastmile.scheduled to handleLastmileScheduled", async () => {
    mockConsolidation.findUnique.mockResolvedValue({ id: "cons-1" });
    mockLastMile.upsert.mockResolvedValue({});

    await applyEntityUpdates({
      event_type: "lastmile.scheduled",
      project_id: "proj-1",
      order_id: null,
      installation_id: null,
      payload: {
        lastmile_id: "LM-1",
        scheduled_date: "2026-04-01T00:00:00Z",
        carrier: "Colissimo",
      },
    });

    expect(mockLastMile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { project_id: "proj-1" },
        create: expect.objectContaining({ status: "scheduled" }),
        update: expect.objectContaining({ status: "scheduled" }),
      }),
    );
  });

  it("routes installation.completed to maybeAutoCloseProject", async () => {
    mockProject.findUnique.mockResolvedValue({
      id: "proj-1",
      status: "active",
      customer_id: "CUST-1",
      last_mile: { status: "delivered" },
      installation: null,
    });
    mockProject.update.mockResolvedValue({});

    await applyEntityUpdates({
      event_type: "installation.completed",
      project_id: "proj-1",
      order_id: null,
      installation_id: "inst-1",
      payload: {},
    });

    expect(mockProject.update).toHaveBeenCalledWith({
      where: { id: "proj-1" },
      data: expect.objectContaining({ status: "completed" }),
    });
  });
});
