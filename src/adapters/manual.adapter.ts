import { z } from "zod";
import { AdapterError, type Adapter, type NormalizedEvent, type RawIngestBody } from "./types.js";

// =============================================================================
// Adaptateur Manual
// Utilisé par le front PLO pour les mises à jour manuelles d'étapes.
// Tous les event_type sont autorisés. Payload libre.
// =============================================================================

const ManualBodySchema = z.object({
  source_ref: z.string().min(1, "source_ref requis"),
  event_type: z.string().min(1, "event_type requis"),
  project_ref: z.string().min(1, "project_ref requis"),
  occurred_at: z.string().datetime({ message: "occurred_at doit être ISO8601" }),
  order_ref: z.string().optional(),
  payload: z.record(z.unknown()).optional().default({}),
});

export class ManualAdapter implements Adapter {
  readonly source = "manual" as const;

  adapt(body: RawIngestBody): NormalizedEvent {
    const result = ManualBodySchema.safeParse(body);
    if (!result.success) {
      throw new AdapterError("Payload manuel invalide", result.error.flatten());
    }
    const data = result.data;
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
