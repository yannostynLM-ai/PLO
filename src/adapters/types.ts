import type { EventSource } from "@prisma/client";

// =============================================================================
// Types communs aux adaptateurs
// =============================================================================

/** Corps brut reçu sur POST /api/events/ingest */
export interface RawIngestBody {
  source: string;
  source_ref: string;
  event_type: string;
  project_ref: string;
  occurred_at: string;
  /** Référence optionnelle à une commande (pour les events Order-level) */
  order_ref?: string;
  payload?: Record<string, unknown>;
}

/** Événement normalisé produit par un adaptateur */
export interface NormalizedEvent {
  source: EventSource;
  source_ref: string;
  event_type: string;
  project_ref: string;
  occurred_at: Date;
  order_ref?: string;
  payload: Record<string, unknown>;
}

/** Interface que chaque adaptateur doit implémenter */
export interface Adapter {
  readonly source: EventSource;
  /**
   * Valide et normalise un corps d'ingestion brut.
   * Lance une AdapterError si la validation échoue.
   */
  adapt(body: RawIngestBody): NormalizedEvent;
}

/** Erreur de validation levée par un adaptateur */
export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
