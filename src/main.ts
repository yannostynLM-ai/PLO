// Chargement du .env avant toute autre importation
import "dotenv/config";

// =============================================================================
// PLO — Point d'entrée principal
// Lance le serveur HTTP Fastify + le worker BullMQ dans le même processus
// =============================================================================

import { startServer } from "./server.js";
import { createEventWorker } from "./workers/event.worker.js";
import { startCron } from "./anomaly/cron.js";
import { eventQueue, deadLetterQueue } from "./lib/queue.js";
import { redis } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  console.log("🚀 PLO — Démarrage...");

  // Démarrage du serveur HTTP
  const fastify = await startServer();

  // Démarrage du worker BullMQ
  const worker = createEventWorker();
  console.log("⚙️  Worker BullMQ démarré (queue: plo-events)");

  // Démarrage du cron d'évaluation des anomalies périodiques
  startCron();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n⏹  Signal ${signal} reçu — arrêt propre...`);
    try {
      await fastify.close();
      await worker.close();
      await eventQueue.close();
      await deadLetterQueue.close();
      await redis.quit();
      await prisma.$disconnect();
      console.log("✓ Arrêt propre terminé");
      process.exit(0);
    } catch (err) {
      console.error("Erreur lors de l'arrêt:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT",  () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
