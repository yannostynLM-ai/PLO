import type {
  Event,
  Project,
  Order,
  Consolidation,
  LastMileDelivery,
  Installation,
} from "@prisma/client";

// =============================================================================
// Types du moteur d'anomalie
// =============================================================================

/** Contexte complet disponible lors de l'évaluation d'une règle */
export interface EvaluationContext {
  event: Event;
  project: Project & {
    consolidation: Consolidation | null;
    last_mile: LastMileDelivery | null;
    installation: Installation | null;
    orders: Order[];
  };
  order: Order | null;
  installation: Installation | null;
}

/** Destinataire d'une notification */
export interface Recipient {
  email: string;
  role: string; // coordinateur, acheteur, entrepot, manager, ops
}

/** Résultat d'une règle déclenchée */
export interface RuleResult {
  ruleId: string;
  projectId: string;
  orderId: string | null;
  installationId: string | null;
  eventId: string;
  recipients: Recipient[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

/** Définition d'une règle temps réel */
export interface RealtimeRule {
  ruleId: string;
  name: string;
  triggers: string[]; // event_types qui déclenchent cette règle
  evaluate: (ctx: EvaluationContext) => Promise<RuleResult | null>;
}

/** Définition d'une règle périodique (cron) */
export interface ScheduledRule {
  ruleId: string;
  name: string;
  frequency: "hourly" | "daily";
  evaluate: () => Promise<RuleResult[]>;
}
