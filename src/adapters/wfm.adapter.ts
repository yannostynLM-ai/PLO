import { z } from "zod";
import { AdapterError, type Adapter, type NormalizedEvent, type RawIngestBody } from "./types.js";

// =============================================================================
// Adaptateur WFM (Workforce Management)
// Couvre : planification + intervention installation
// =============================================================================

const WFM_ALLOWED_EVENT_TYPES = new Set([
  // Planification
  "installation.scheduled",
  "installation.rescheduled",
  "installation.cancelled",
  // Intervention
  "installation.started",
  "installation.completed",
  "installation.issue",
  "installation.partial",
  "installation.report_submitted",
  // Contrôle qualité
  "customer_signature.signed",
]);

const SlotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "format HH:MM attendu"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "format HH:MM attendu"),
});

const PayloadSchemaByEventType: Record<string, z.ZodTypeAny> = {
  "installation.scheduled": z.object({
    wfm_job_ref: z.string(),
    technician_id: z.string().optional(),
    technician_name: z.string().optional(),
    scheduled_date: z.string().datetime(),
    scheduled_slot: SlotSchema.optional(),
    installation_address: z.object({
      street: z.string(),
      city: z.string(),
      zip: z.string(),
      country: z.string(),
    }).optional(),
  }),

  "installation.rescheduled": z.object({
    wfm_job_ref: z.string(),
    new_scheduled_date: z.string().datetime(),
    new_scheduled_slot: SlotSchema.optional(),
    reason: z.string().optional(),
    technician_id: z.string().optional(),
  }),

  "installation.cancelled": z.object({
    wfm_job_ref: z.string().optional(),
    reason: z.string().optional(),
  }),

  "installation.started": z.object({
    wfm_job_ref: z.string().optional(),
    technician_id: z.string().optional(),
    started_at: z.string().datetime().optional(),
  }),

  "installation.completed": z.object({
    wfm_job_ref: z.string().optional(),
    technician_id: z.string().optional(),
    completed_at: z.string().datetime().optional(),
    report_pending: z.boolean().optional(),
  }),

  "installation.issue": z.object({
    wfm_job_ref: z.string().optional(),
    technician_id: z.string().optional(),
    severity: z.enum(["blocking", "minor"]).optional(),
    description: z.string().optional(),
    missing_skus: z.array(z.string()).optional(),
    photos_url: z.array(z.string()).optional(),
  }),

  "installation.partial": z.object({
    wfm_job_ref: z.string().optional(),
    completed_steps: z.array(z.string()).optional(),
    remaining_steps: z.array(z.string()).optional(),
    follow_up_required: z.boolean().optional(),
  }),

  "installation.report_submitted": z.object({
    wfm_job_ref: z.string().optional(),
    technician_id: z.string().optional(),
    submitted_at: z.string().datetime().optional(),
    report_url: z.string().optional(),
  }),

  "customer_signature.signed": z.object({
    wfm_job_ref: z.string().optional(),
    signed: z.boolean(),
    refusal_reason: z.string().optional(),
    signature_url: z.string().optional(),
  }),
};

const BaseWfmSchema = z.object({
  source_ref: z.string().min(1),
  event_type: z.string().min(1),
  project_ref: z.string().min(1),
  occurred_at: z.string().datetime({ message: "occurred_at doit être ISO8601" }),
  order_ref: z.string().optional(),
  payload: z.record(z.unknown()).optional().default({}),
});

export class WfmAdapter implements Adapter {
  readonly source = "wfm" as const;

  adapt(body: RawIngestBody): NormalizedEvent {
    const base = BaseWfmSchema.safeParse(body);
    if (!base.success) {
      throw new AdapterError("Payload WFM invalide", base.error.flatten());
    }
    const data = base.data;

    if (!WFM_ALLOWED_EVENT_TYPES.has(data.event_type)) {
      throw new AdapterError(
        `event_type '${data.event_type}' non autorisé pour la source WFM`
      );
    }

    const payloadSchema = PayloadSchemaByEventType[data.event_type];
    if (payloadSchema) {
      const result = payloadSchema.safeParse(data.payload);
      if (!result.success) {
        throw new AdapterError(
          `Payload invalide pour ${data.event_type}`,
          result.error.flatten()
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
