import { z } from "zod";
import { AdapterError, type Adapter, type NormalizedEvent, type RawIngestBody } from "./types.js";

// =============================================================================
// Adaptateur OMS (Order Management System)
// Couvre : expéditions (Shipment) + consolidation en delivery station
// =============================================================================

const OMS_ALLOWED_EVENT_TYPES = new Set([
  "shipment.dispatched",
  "shipment.in_transit",
  "shipment.eta_updated",
  "shipment.arrived_at_station",
  "shipment.exception",
  "consolidation.order_arrived",
  "consolidation.eta_updated",
  "consolidation.complete",
  "consolidation.partial_approved",
  "consolidation.exception",
]);

const ShipmentPayloadSchema = z.object({
  shipment_id: z.string(),
  order_ref: z.string().optional(),
  leg_number: z.number().int().positive().optional(),
  origin_type: z.enum(["warehouse", "store", "supplier", "crossdock_station"]).optional(),
  origin_ref: z.string().optional(),
  destination_station_id: z.string().optional(),
  carrier: z.string().optional(),
  carrier_tracking_ref: z.string().optional(),
  estimated_arrival: z.string().nullable().optional(),
  actual_arrival: z.string().nullable().optional(),
});

const ConsolidationPayloadSchema = z.object({
  consolidation_id: z.string(),
  project_ref: z.string().optional(),
  station_id: z.string().optional(),
  orders_total: z.number().int().optional(),
  orders_arrived: z.number().int().optional(),
  orders_missing: z.array(z.string()).optional(),
  estimated_complete_date: z.string().optional(),
  status: z.enum(["waiting", "in_progress", "complete", "partial_approved"]).optional(),
  // Pour consolidation.partial_approved
  partial_approved_by: z.object({
    customer: z.boolean(),
    installer: z.boolean(),
    approved_at: z.string(),
  }).optional(),
});

const PayloadSchemaByEventType: Record<string, z.ZodTypeAny> = {
  "shipment.dispatched": ShipmentPayloadSchema,
  "shipment.in_transit": ShipmentPayloadSchema,
  "shipment.eta_updated": ShipmentPayloadSchema.extend({
    previous_eta: z.string().optional(),
    new_eta: z.string().optional(),
    delay_days: z.number().optional(),
    reason: z.string().optional(),
  }),
  "shipment.arrived_at_station": ShipmentPayloadSchema,
  "shipment.exception": ShipmentPayloadSchema.extend({
    exception_type: z.string().optional(),
    exception_description: z.string().optional(),
  }),
  "consolidation.order_arrived": ConsolidationPayloadSchema.extend({
    order_id: z.string(),
    arrived_at: z.string(),
  }),
  "consolidation.eta_updated": ConsolidationPayloadSchema,
  "consolidation.complete": ConsolidationPayloadSchema,
  "consolidation.partial_approved": ConsolidationPayloadSchema,
  "consolidation.exception": ConsolidationPayloadSchema.extend({
    exception_type: z.string().optional(),
    affected_order_ids: z.array(z.string()).optional(),
  }),
};

const BaseOmsSchema = z.object({
  source_ref: z.string().min(1),
  event_type: z.string().min(1),
  project_ref: z.string().min(1),
  occurred_at: z.string().datetime({ message: "occurred_at doit être ISO8601" }),
  order_ref: z.string().optional(),
  payload: z.record(z.unknown()).optional().default({}),
});

export class OmsAdapter implements Adapter {
  readonly source = "oms" as const;

  adapt(body: RawIngestBody): NormalizedEvent {
    const base = BaseOmsSchema.safeParse(body);
    if (!base.success) {
      throw new AdapterError("Payload OMS invalide", base.error.flatten());
    }
    const data = base.data;

    if (!OMS_ALLOWED_EVENT_TYPES.has(data.event_type)) {
      throw new AdapterError(
        `event_type '${data.event_type}' non autorisé pour la source OMS`
      );
    }

    const payloadSchema = PayloadSchemaByEventType[data.event_type];
    if (payloadSchema) {
      const payloadResult = payloadSchema.safeParse(data.payload);
      if (!payloadResult.success) {
        throw new AdapterError(
          `Payload invalide pour ${data.event_type}`,
          payloadResult.error.flatten()
        );
      }
    }

    return {
      source: this.source,
      source_ref: data.source_ref,
      event_type: data.event_type,
      project_ref: data.project_ref,
      occurred_at: new Date(data.occurred_at),
      order_ref: data.order_ref,
      payload: data.payload,
    };
  }
}
