import { z } from "zod";
import { AdapterError, type Adapter, type NormalizedEvent, type RawIngestBody } from "./types.js";

// =============================================================================
// Adaptateur TMS Last Mile
// Couvre : livraison finale client (source: tms_lastmile)
// =============================================================================

const TMS_ALLOWED_EVENT_TYPES = new Set([
  "lastmile.scheduled",
  "lastmile.rescheduled",
  "lastmile.in_transit",
  "lastmile.delivered",
  "lastmile.partial_delivered",
  "lastmile.failed",
  "lastmile.damaged",
]);

const TimeSlotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM requis"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM requis"),
});

const BaseLastMilePayload = z.object({
  lastmile_id: z.string(),
  carrier: z.string().optional(),
  carrier_tracking_ref: z.string().optional(),
});

const PayloadSchemaByEventType: Record<string, z.ZodTypeAny> = {
  "lastmile.scheduled": BaseLastMilePayload.extend({
    scheduled_date: z.string().datetime(),
    time_slot: TimeSlotSchema.optional(),
    is_partial: z.boolean().optional().default(false),
    missing_order_ids: z.array(z.string()).optional().default([]),
  }),

  "lastmile.rescheduled": BaseLastMilePayload.extend({
    scheduled_date: z.string().datetime(),
    time_slot: TimeSlotSchema.optional(),
    reason: z.string().optional(),
    previous_date: z.string().optional(),
  }),

  "lastmile.in_transit": BaseLastMilePayload,

  "lastmile.delivered": BaseLastMilePayload.extend({
    delivered_at: z.string().datetime(),
    pod_url: z.string().url().nullable().optional(),
    is_partial: z.boolean().optional().default(false),
    missing_order_ids: z.array(z.string()).optional().default([]),
  }),

  "lastmile.partial_delivered": BaseLastMilePayload.extend({
    delivered_at: z.string().datetime(),
    pod_url: z.string().url().nullable().optional(),
    missing_order_ids: z.array(z.string()).min(1, "Au moins un order_id manquant requis"),
  }),

  "lastmile.failed": BaseLastMilePayload.extend({
    reason: z.string().optional(),
    rescheduled_date: z.string().optional(),
  }),

  "lastmile.damaged": BaseLastMilePayload.extend({
    damaged_items: z.array(z.string()).optional(),
    description: z.string().optional(),
  }),
};

const BaseTmsSchema = z.object({
  source_ref: z.string().min(1),
  event_type: z.string().min(1),
  project_ref: z.string().min(1),
  occurred_at: z.string().datetime({ message: "occurred_at doit être ISO8601" }),
  order_ref: z.string().optional(),
  payload: z.record(z.unknown()).optional().default({}),
});

export class TmsAdapter implements Adapter {
  readonly source = "tms_lastmile" as const;

  adapt(body: RawIngestBody): NormalizedEvent {
    const base = BaseTmsSchema.safeParse(body);
    if (!base.success) {
      throw new AdapterError("Payload TMS invalide", base.error.flatten());
    }
    const data = base.data;

    if (!TMS_ALLOWED_EVENT_TYPES.has(data.event_type)) {
      throw new AdapterError(
        `event_type '${data.event_type}' non autorisé pour la source TMS last mile`
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
