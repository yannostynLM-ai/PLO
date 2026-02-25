import cron from "node-cron";
import { evaluateScheduledRules } from "./engine.js";
import { runEscalationCheck } from "../services/escalation.service.js";

// =============================================================================
// Cron PLO — Évaluation périodique des règles d'anomalie
// =============================================================================

/**
 * Démarre les deux jobs cron :
 *  - Horaire  (0 * * * *)  : ANO-08, ANO-09, ANO-13, ANO-14, ANO-21
 *  - Quotidien (0 9 * * *) : ANO-07, ANO-10, ANO-17
 */
export function startCron(): void {
  // Évaluation horaire — règles de surveillance opérationnelle
  cron.schedule("0 * * * *", async () => {
    console.log("[Cron] Évaluation horaire des règles d'anomalie...");
    try {
      await evaluateScheduledRules("hourly");
    } catch (err) {
      console.error("[Cron] Erreur évaluation horaire:", err);
    }
  });

  // Évaluation quotidienne à 9h — règles de planification J-N
  cron.schedule("0 9 * * *", async () => {
    console.log("[Cron] Évaluation quotidienne des règles d'anomalie...");
    try {
      await evaluateScheduledRules("daily");
    } catch (err) {
      console.error("[Cron] Erreur évaluation quotidienne:", err);
    }
  });

  // Sprint 6 — Escalade toutes les 30 min
  cron.schedule("*/30 * * * *", async () => {
    console.log("[Cron] Vérification des escalades...");
    try {
      await runEscalationCheck();
    } catch (err) {
      console.error("[Cron] Erreur escalade:", err);
    }
  });

  console.log("⏰ Cron PLO démarré (horaire + quotidien 9h + escalade 30min)");
}
