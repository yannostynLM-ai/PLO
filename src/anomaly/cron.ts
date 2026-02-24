import cron from "node-cron";
import { evaluateScheduledRules } from "./engine.js";

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

  console.log("⏰ Cron PLO démarré (horaire + quotidien 9h)");
}
