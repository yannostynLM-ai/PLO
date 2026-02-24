import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// Cast utilitaire pour les champs Json de Prisma
function toJson(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue;
}

// =============================================================================
// Entity Service — Mises à jour des entités métier déclenchées par les événements
// =============================================================================

type Payload = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function dateStr(v: unknown): Date | undefined {
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

// -----------------------------------------------------------------------------
// ERP — order.confirmed
// Crée l'Order et ses lignes si elle n'existe pas encore
// -----------------------------------------------------------------------------
export async function handleOrderConfirmed(
  projectId: string,
  payload: Payload
): Promise<string | null> {
  const erpRef = str(payload["erp_order_ref"]);
  if (!erpRef) return null;

  const existing = await prisma.order.findFirst({
    where: { project_id: projectId, erp_order_ref: erpRef },
  });

  if (existing) {
    await prisma.order.update({
      where: { id: existing.id },
      data: { status: "confirmed", updated_at: new Date() },
    });
    return existing.id;
  }

  const rawAddress = payload["delivery_address"] as Record<string, unknown> | undefined;
  const deliveryAddress = rawAddress ?? { street: "", city: "", zip: "", country: "" };

  const order = await prisma.order.create({
    data: {
      project_id: projectId,
      erp_order_ref: erpRef,
      status: "confirmed",
      delivery_address: toJson(deliveryAddress),
      installation_required: bool(payload["installation_required"]) ?? false,
      lead_time_days: num(payload["lead_time_days"]),
      promised_delivery_date: dateStr(payload["promised_delivery_date"]),
    },
  });

  // Crée les OrderLines si fournies dans le payload
  const lines = payload["lines"];
  if (Array.isArray(lines) && lines.length > 0) {
    await prisma.orderLine.createMany({
      data: lines.map((l: unknown) => {
        const line = l as Record<string, unknown>;
        return {
          order_id: order.id,
          sku: str(line["sku"]) ?? "UNKNOWN",
          label: str(line["label"]) ?? str(line["sku"]) ?? "UNKNOWN",
          quantity: num(line["qty"]) ?? 1,
          unit_price: num(line["unit_price"]) ?? 0,
          installation_required: bool(line["installation_required"]) ?? false,
        };
      }),
    });
  }

  // Auto-crée la Consolidation si elle n'existe pas encore
  const consolidation = await prisma.consolidation.findUnique({
    where: { project_id: projectId },
  });
  if (!consolidation) {
    await prisma.consolidation.create({
      data: {
        project_id: projectId,
        station_id: "PENDING",
        station_name: "À déterminer",
        status: "waiting",
        orders_required: [order.id],
        orders_arrived: [],
      },
    });
  } else {
    // Ajoute cette commande aux orders_required
    await prisma.consolidation.update({
      where: { project_id: projectId },
      data: {
        orders_required: {
          push: order.id,
        },
        updated_at: new Date(),
      },
    });
  }

  return order.id;
}

// -----------------------------------------------------------------------------
// ERP — stock.shortage / stock.check_ok / stock.partial
// -----------------------------------------------------------------------------
export async function handleStockShortage(
  projectId: string,
  orderId: string | null,
  payload: Payload
): Promise<void> {
  const sku = str(payload["sku"]);
  if (!sku) return;

  // Cherche les OrderLines correspondant au SKU pour ce projet
  const where = orderId
    ? { order_id: orderId, sku }
    : { order: { project_id: projectId }, sku };

  await prisma.orderLine.updateMany({
    where,
    data: { stock_status: "shortage", updated_at: new Date() },
  });
}

export async function handleStockCheckOk(
  orderId: string | null,
  projectId: string
): Promise<void> {
  const where = orderId
    ? { order_id: orderId }
    : { order: { project_id: projectId } };

  await prisma.orderLine.updateMany({
    where,
    data: { stock_status: "available", updated_at: new Date() },
  });
}

// -----------------------------------------------------------------------------
// OMS — shipment.dispatched / in_transit / eta_updated / arrived_at_station
// -----------------------------------------------------------------------------
export async function handleShipmentDispatched(
  orderId: string | null,
  projectId: string,
  payload: Payload
): Promise<void> {
  const omsRef = str(payload["shipment_id"]);
  if (!omsRef || !orderId) return;

  await prisma.shipment.upsert({
    where: { id: omsRef },
    create: {
      id: omsRef,
      order_id: orderId,
      project_id: projectId,
      oms_ref: omsRef,
      leg_number: num(payload["leg_number"]) ?? 1,
      origin_type: (str(payload["origin_type"]) as "warehouse" | "store" | "supplier" | "crossdock_station") ?? "warehouse",
      origin_ref: str(payload["origin_ref"]) ?? "",
      destination_station_id: str(payload["destination_station_id"]) ?? "",
      carrier: str(payload["carrier"]),
      carrier_tracking_ref: str(payload["carrier_tracking_ref"]),
      status: "dispatched",
      estimated_arrival: dateStr(payload["estimated_arrival"]),
    },
    update: {
      status: "dispatched",
      updated_at: new Date(),
    },
  });
}

export async function handleShipmentEtaUpdated(
  payload: Payload
): Promise<void> {
  const omsRef = str(payload["shipment_id"]);
  const newEta = dateStr(payload["new_eta"] ?? payload["estimated_arrival"]);
  if (!omsRef || !newEta) return;

  await prisma.shipment.updateMany({
    where: { oms_ref: omsRef },
    data: { estimated_arrival: newEta, updated_at: new Date() },
  });

  // Recalcule estimated_complete_date de la Consolidation =
  // max des ETA de tous les Shipments non encore arrivés pour ce projet
  const shipment = await prisma.shipment.findFirst({ where: { oms_ref: omsRef } });
  if (!shipment) return;

  const pendingShipments = await prisma.shipment.findMany({
    where: {
      project_id: shipment.project_id,
      status: { in: ["pending", "dispatched", "in_transit"] },
      estimated_arrival: { not: null },
    },
    orderBy: { estimated_arrival: "desc" },
  });

  if (pendingShipments.length === 0) return;

  const maxEta = pendingShipments[0]?.estimated_arrival;
  if (!maxEta) return;

  await prisma.consolidation.updateMany({
    where: { project_id: shipment.project_id },
    data: { estimated_complete_date: maxEta, updated_at: new Date() },
  });
}

export async function handleShipmentArrivedAtStation(
  projectId: string,
  orderId: string | null,
  payload: Payload
): Promise<void> {
  const omsRef = str(payload["shipment_id"]);
  if (omsRef) {
    await prisma.shipment.updateMany({
      where: { oms_ref: omsRef },
      data: {
        status: "arrived",
        actual_arrival: new Date(),
        updated_at: new Date(),
      },
    });
  }

  if (!orderId) return;

  // Met à jour la Consolidation : ajoute orderId à orders_arrived
  const consolidation = await prisma.consolidation.findUnique({
    where: { project_id: projectId },
  });
  if (!consolidation) return;

  if (consolidation.orders_arrived.includes(orderId)) return;

  const newArrived = [...consolidation.orders_arrived, orderId];
  const allArrived = consolidation.orders_required.every((id) =>
    newArrived.includes(id)
  );

  await prisma.consolidation.update({
    where: { project_id: projectId },
    data: {
      orders_arrived: newArrived,
      status: allArrived ? "complete" : "in_progress",
      updated_at: new Date(),
    },
  });
}

// -----------------------------------------------------------------------------
// OMS — consolidation.complete / partial_approved
// -----------------------------------------------------------------------------
export async function handleConsolidationComplete(projectId: string): Promise<void> {
  await prisma.consolidation.updateMany({
    where: { project_id: projectId },
    data: { status: "complete", updated_at: new Date() },
  });

  // Met à jour le step Project
  await prisma.step.updateMany({
    where: { project_id: projectId, step_type: "consolidation_in_progress" },
    data: { status: "completed", completed_at: new Date(), updated_at: new Date() },
  });
}

export async function handleConsolidationPartialApproved(
  projectId: string,
  payload: Payload
): Promise<void> {
  const approvedBy = payload["partial_approved_by"] as Record<string, unknown> | undefined;

  await prisma.consolidation.updateMany({
    where: { project_id: projectId },
    data: {
      status: "partial_approved",
      partial_delivery_approved: true,
      partial_approved_by: toJson(approvedBy ?? {
        customer: true,
        installer: true,
        approved_at: new Date().toISOString(),
      }),
      updated_at: new Date(),
    },
  });
}

// -----------------------------------------------------------------------------
// TMS — lastmile.scheduled
// -----------------------------------------------------------------------------
export async function handleLastmileScheduled(
  projectId: string,
  payload: Payload
): Promise<void> {
  const consolidation = await prisma.consolidation.findUnique({
    where: { project_id: projectId },
  });

  const consolidationId = consolidation?.id ?? "UNKNOWN";

  const lastmileId = str(payload["lastmile_id"]);
  const scheduledDate = dateStr(payload["scheduled_date"]);

  const rawAddress = (payload["delivery_address"] as Record<string, unknown> | undefined) ?? { street: "", city: "", zip: "", country: "" };

  if (lastmileId) {
    await prisma.lastMileDelivery.upsert({
      where: { project_id: projectId },
      create: {
        project_id: projectId,
        consolidation_id: consolidationId,
        tms_delivery_ref: lastmileId,
        carrier: str(payload["carrier"]),
        status: "scheduled",
        delivery_address: toJson(rawAddress),
        scheduled_date: scheduledDate,
        scheduled_slot: payload["time_slot"] != null ? toJson(payload["time_slot"]) : undefined,
        is_partial: bool(payload["is_partial"]) ?? false,
        missing_order_ids: (payload["missing_order_ids"] as string[] | undefined) ?? [],
      },
      update: {
        status: "scheduled",
        scheduled_date: scheduledDate,
        scheduled_slot: payload["time_slot"] != null ? toJson(payload["time_slot"]) : undefined,
        updated_at: new Date(),
      },
    });
  }
}

// -----------------------------------------------------------------------------
// TMS — lastmile.delivered / partial_delivered / failed
// -----------------------------------------------------------------------------
export async function handleLastmileDelivered(
  projectId: string,
  eventType: string,
  payload: Payload
): Promise<void> {
  const status =
    eventType === "lastmile.partial_delivered" ? "partial_delivered"
    : eventType === "lastmile.failed" ? "failed"
    : "delivered";

  await prisma.lastMileDelivery.updateMany({
    where: { project_id: projectId },
    data: {
      status,
      delivered_at: status === "delivered" || status === "partial_delivered"
        ? (dateStr(payload["delivered_at"]) ?? new Date())
        : undefined,
      pod_url: str(payload["pod_url"]),
      is_partial: eventType === "lastmile.partial_delivered" ? true : undefined,
      updated_at: new Date(),
    },
  });
}

// -----------------------------------------------------------------------------
// Dispatcher principal — appelé par le worker
// -----------------------------------------------------------------------------
export async function applyEntityUpdates(params: {
  event_type: string;
  project_id: string;
  order_id: string | null;
  installation_id: string | null;
  payload: Payload;
}): Promise<void> {
  const { event_type, project_id, order_id, payload } = params;

  switch (event_type) {
    case "order.confirmed":
      await handleOrderConfirmed(project_id, payload);
      break;

    case "stock.shortage":
    case "stock.partial":
      await handleStockShortage(project_id, order_id, payload);
      break;

    case "stock.check_ok":
      await handleStockCheckOk(order_id, project_id);
      break;

    case "shipment.dispatched":
      await handleShipmentDispatched(order_id, project_id, payload);
      break;

    case "shipment.eta_updated":
      await handleShipmentEtaUpdated(payload);
      break;

    case "shipment.arrived_at_station":
      await handleShipmentArrivedAtStation(project_id, order_id, payload);
      break;

    case "consolidation.complete":
      await handleConsolidationComplete(project_id);
      break;

    case "consolidation.partial_approved":
      await handleConsolidationPartialApproved(project_id, payload);
      break;

    case "lastmile.scheduled":
    case "lastmile.rescheduled":
      await handleLastmileScheduled(project_id, payload);
      break;

    case "lastmile.delivered":
    case "lastmile.partial_delivered":
    case "lastmile.failed":
      await handleLastmileDelivered(project_id, event_type, payload);
      break;

    default:
      // Pas de mise à jour d'entité pour cet event_type
      break;
  }
}
