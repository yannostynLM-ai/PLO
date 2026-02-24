import { prisma } from "../lib/prisma.js";
import { REALTIME_RULES } from "./rules/realtime.rules.js";
import { HOURLY_RULES, DAILY_RULES } from "./rules/scheduled.rules.js";
import { handleRuleResult, handleScheduledRuleResult } from "../services/notification.service.js";
import type { EvaluationContext } from "./types.js";

// =============================================================================
// Moteur d'anomalie PLO
// =============================================================================

/**
 * Charge le contexte complet pour l'évaluation d'une règle temps réel.
 */
async function loadContext(params: {
  eventId: string;
  projectId: string;
  orderId: string | null;
  installationId: string | null;
}): Promise<EvaluationContext | null> {
  const event = await prisma.event.findUnique({
    where: { id: params.eventId },
  });
  if (!event) return null;

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    include: {
      consolidation: true,
      last_mile: true,
      installation: true,
      orders: true,
    },
  });
  if (!project) return null;

  const order = params.orderId
    ? await prisma.order.findUnique({ where: { id: params.orderId } })
    : null;

  const installation = params.installationId
    ? await prisma.installation.findUnique({ where: { id: params.installationId } })
    : (project.installation ?? null);

  return { event, project, order, installation };
}

/**
 * Évalue toutes les règles temps réel applicables à l'événement entrant.
 * Appelé par le worker BullMQ après traitement de l'événement.
 */
export async function evaluateRealTimeRules(params: {
  eventId: string;
  projectId: string;
  orderId: string | null;
  installationId: string | null;
  eventType: string;
}): Promise<void> {
  const applicableRules = REALTIME_RULES.filter((rule) =>
    rule.triggers.includes(params.eventType)
  );
  if (applicableRules.length === 0) return;

  const ctx = await loadContext(params);
  if (!ctx) {
    console.warn(`[AnomalyEngine] Contexte introuvable pour event ${params.eventId}`);
    return;
  }

  for (const rule of applicableRules) {
    try {
      const result = await rule.evaluate(ctx);
      if (result) {
        await handleRuleResult(result);
        console.log(
          `[AnomalyEngine] ⚡ Règle ${rule.ruleId} déclenchée — projet ${params.projectId}`
        );
      }
    } catch (err) {
      console.error(`[AnomalyEngine] Erreur sur règle ${rule.ruleId}:`, err);
      // Non bloquant : une règle en erreur ne doit pas bloquer les autres
    }
  }
}

/**
 * Évalue toutes les règles périodiques pour une fréquence donnée.
 * Appelé par node-cron.
 */
export async function evaluateScheduledRules(
  frequency: "hourly" | "daily"
): Promise<void> {
  const rules = frequency === "hourly" ? HOURLY_RULES : DAILY_RULES;
  console.log(`[AnomalyEngine] Évaluation cron ${frequency} — ${rules.length} règle(s)`);

  for (const rule of rules) {
    try {
      const results = await rule.evaluate();
      for (const result of results) {
        await handleScheduledRuleResult(result);
        if (results.length > 0) {
          console.log(
            `[AnomalyEngine] ⏰ Règle ${rule.ruleId} — ${results.length} déclenchement(s)`
          );
        }
      }
    } catch (err) {
      console.error(`[AnomalyEngine] Erreur cron sur règle ${rule.ruleId}:`, err);
    }
  }
}
