import { z } from "zod";
import { AdapterError, type Adapter, type NormalizedEvent, type RawIngestBody } from "./types.js";

// =============================================================================
// Adaptateur CRM
// Couvre : clôture projet, contrôle qualité, tickets, signature client
// =============================================================================

const CRM_ALLOWED_EVENT_TYPES = new Set([
  // Clôture projet
  "project.closed",
  "project.closed_with_issue",
  "project.reopened",
  // Contrôle qualité
  "quality.survey_sent",
  "quality.survey_completed",
  "quality.issue_raised",
  // Tickets SAV
  "sav.ticket_created",
  "sav.ticket_resolved",
  "sav.ticket_escalated",
  // Accord livraison partielle (recueilli par customer care)
  "partial_delivery.customer_approved",
  "partial_delivery.customer_refused",
]);

const PayloadSchemaByEventType: Record<string, z.ZodTypeAny> = {
  "project.closed": z.object({
    crm_ticket_ref: z.string().optional(),
    closed_by: z.string().optional(),
    closure_reason: z.string().optional(),
  }),

  "project.closed_with_issue": z.object({
    crm_ticket_ref: z.string().optional(),
    issue_description: z.string().optional(),
    resolution: z.string().optional(),
  }),

  "project.reopened": z.object({
    crm_ticket_ref: z.string().optional(),
    reason: z.string().optional(),
    reopened_by: z.string().optional(),
  }),

  "quality.survey_sent": z.object({
    channel: z.enum(["email", "sms"]).optional(),
    recipient: z.string().optional(),
  }),

  "quality.survey_completed": z.object({
    score: z.number().int().min(0).max(10).optional(),
    nps: z.number().int().min(-100).max(100).optional(),
    verbatim: z.string().optional(),
    submitted_at: z.string().datetime().optional(),
  }),

  "quality.issue_raised": z.object({
    score: z.number().int().min(0).max(10).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
  }),

  "sav.ticket_created": z.object({
    crm_ticket_ref: z.string(),
    category: z.string().optional(),
    description: z.string().optional(),
    created_by: z.string().optional(),
  }),

  "sav.ticket_resolved": z.object({
    crm_ticket_ref: z.string(),
    resolution: z.string().optional(),
    resolved_by: z.string().optional(),
    resolved_at: z.string().datetime().optional(),
  }),

  "sav.ticket_escalated": z.object({
    crm_ticket_ref: z.string(),
    escalated_to: z.string().optional(),
    reason: z.string().optional(),
  }),

  "partial_delivery.customer_approved": z.object({
    approved_by: z.string().optional(),
    missing_order_ids: z.array(z.string()).optional(),
    approved_at: z.string().datetime().optional(),
  }),

  "partial_delivery.customer_refused": z.object({
    refused_by: z.string().optional(),
    reason: z.string().optional(),
  }),
};

const BaseCrmSchema = z.object({
  source_ref: z.string().min(1),
  event_type: z.string().min(1),
  project_ref: z.string().min(1),
  occurred_at: z.string().datetime({ message: "occurred_at doit être ISO8601" }),
  order_ref: z.string().optional(),
  payload: z.record(z.unknown()).optional().default({}),
});

export class CrmAdapter implements Adapter {
  readonly source = "crm" as const;

  adapt(body: RawIngestBody): NormalizedEvent {
    const base = BaseCrmSchema.safeParse(body);
    if (!base.success) {
      throw new AdapterError("Payload CRM invalide", base.error.flatten());
    }
    const data = base.data;

    if (!CRM_ALLOWED_EVENT_TYPES.has(data.event_type)) {
      throw new AdapterError(
        `event_type '${data.event_type}' non autorisé pour la source CRM`
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
