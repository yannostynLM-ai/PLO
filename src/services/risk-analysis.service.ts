// =============================================================================
// PLO — Service d'analyse de risque projet (Sprint 8)
// Utilise Claude API (Haiku) ou fallback heuristique si clé absente
// =============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RiskFactor {
  factor: string;
  impact: "low" | "medium" | "high";
  detail: string;
}

export interface RiskAnalysis {
  risk_score: number;
  level: "low" | "medium" | "high" | "critical";
  summary: string;
  factors: RiskFactor[];
  recommendation: string;
  generated_at: string;
  cached: boolean;
}

// ---------------------------------------------------------------------------
// Cache in-memory 5 minutes
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: RiskAnalysis; expires: number }>();

function getCached(projectId: string): RiskAnalysis | null {
  const entry = cache.get(projectId);
  if (entry && entry.expires > Date.now()) {
    return { ...entry.data, cached: true };
  }
  cache.delete(projectId);
  return null;
}

function setCached(projectId: string, data: RiskAnalysis): void {
  cache.set(projectId, { data, expires: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Tu es un expert en gestion de projets de rénovation habitat pour un retailer omnicanal.
Analyse le projet ci-dessous et retourne UNIQUEMENT un objet JSON valide (sans markdown, sans commentaires) avec cette structure exacte :
{
  "risk_score": <entier 0-100>,
  "level": "<low|medium|high|critical>",
  "summary": "<2-3 phrases en français décrivant le niveau de risque>",
  "factors": [
    { "factor": "<nom court>", "impact": "<low|medium|high>", "detail": "<explication 1 phrase>" }
  ],
  "recommendation": "<action prioritaire en 1-2 phrases en français>"
}
Calibration du score : 0-25 = low, 26-50 = medium, 51-75 = high, 76-100 = critical.`;

interface Metrics {
  daysOld: number;
  shortageCount: number;
  lateShipmentsCount: number;
  avgDeliveryDelayDays: number | null;
  consolidationRatio: number | null;
  completedStepsRate: number;
  criticalAnomaliesCount: number;
  warningAnomaliesCount: number;
}

interface HistoricalStats {
  totalProjects: number;
  totalNotifs: number;
  totalCriticalNotifs: number;
}

function buildUserPrompt(
  project: {
    project_type: string;
    channel_origin: string;
    status: string;
    created_at: Date;
    orders: Array<{ status: string; promised_delivery_date: Date | null }>;
    consolidation: { status: string; orders_arrived: string[]; orders_required: string[] } | null;
    last_mile: { status: string; scheduled_date: Date | null; delivered_at: Date | null } | null;
    installation: { status: string; scheduled_date: Date | null } | null;
  },
  metrics: Metrics,
  stats: HistoricalStats,
): string {
  const today = new Date().toISOString().split("T")[0];
  const criticalRate = stats.totalNotifs > 0
    ? ((stats.totalCriticalNotifs / stats.totalNotifs) * 100).toFixed(1)
    : "0.0";

  return `Date d'analyse : ${today}

=== PROJET ===
Type : ${project.project_type} | Canal : ${project.channel_origin} | Statut : ${project.status}
Âge du dossier : ${metrics.daysOld} jours
Nombre de commandes : ${project.orders.length}

=== SIGNAUX DE RISQUE ===
Lignes en rupture/backorder : ${metrics.shortageCount}
Expéditions en retard vs promesse : ${metrics.lateShipmentsCount}
Délai moyen ETA vs promesse : ${metrics.avgDeliveryDelayDays !== null ? `+${metrics.avgDeliveryDelayDays.toFixed(1)}j` : "N/A"}
Taux complétion des étapes : ${(metrics.completedStepsRate * 100).toFixed(0)}%
Anomalies critiques actives : ${metrics.criticalAnomaliesCount}
Anomalies warning actives : ${metrics.warningAnomaliesCount}

=== CONSOLIDATION ===
${project.consolidation
  ? `Statut : ${project.consolidation.status} | Arrivées : ${project.consolidation.orders_arrived.length}/${project.consolidation.orders_required.length}`
  : "Pas de consolidation"}
${metrics.consolidationRatio !== null ? `Ratio d'avancement : ${(metrics.consolidationRatio * 100).toFixed(0)}%` : ""}

=== LAST MILE ===
${project.last_mile
  ? `Statut : ${project.last_mile.status} | Planifié : ${project.last_mile.scheduled_date?.toISOString().split("T")[0] ?? "non"} | Livré : ${project.last_mile.delivered_at ? "oui" : "non"}`
  : "Pas de livraison domicile"}

=== INSTALLATION ===
${project.installation
  ? `Statut : ${project.installation.status} | Planifiée : ${project.installation.scheduled_date?.toISOString().split("T")[0] ?? "non"}`
  : "Pas d'installation prévue"}

=== CONTEXTE HISTORIQUE (base PLO) ===
Projets totaux en base : ${stats.totalProjects}
Taux d'anomalies critiques historique : ${criticalRate}%

Analyse et fournis le JSON de risque.`;
}

// ---------------------------------------------------------------------------
// Calcul heuristique (fallback sans API key)
// ---------------------------------------------------------------------------

function heuristicAnalysis(metrics: Metrics): RiskAnalysis {
  let score = 0;
  const factors: RiskFactor[] = [];

  if (metrics.criticalAnomaliesCount > 0) {
    score += Math.min(30, metrics.criticalAnomaliesCount * 15);
    factors.push({
      factor: "Anomalies critiques",
      impact: "high",
      detail: `${metrics.criticalAnomaliesCount} anomalie(s) critique(s) active(s) non acquittée(s).`,
    });
  }

  if (metrics.shortageCount > 0) {
    score += Math.min(20, metrics.shortageCount * 10);
    factors.push({
      factor: "Ruptures de stock",
      impact: metrics.shortageCount > 2 ? "high" : "medium",
      detail: `${metrics.shortageCount} ligne(s) en rupture ou backorder.`,
    });
  }

  if (metrics.lateShipmentsCount > 0) {
    score += Math.min(20, metrics.lateShipmentsCount * 10);
    factors.push({
      factor: "Expéditions en retard",
      impact: "medium",
      detail: `${metrics.lateShipmentsCount} expédition(s) dépassant la date de livraison promise.`,
    });
  }

  if (metrics.avgDeliveryDelayDays !== null && metrics.avgDeliveryDelayDays > 3) {
    score += Math.min(15, Math.floor(metrics.avgDeliveryDelayDays * 2));
    factors.push({
      factor: "Délai ETA",
      impact: metrics.avgDeliveryDelayDays > 7 ? "high" : "medium",
      detail: `Retard moyen de ${metrics.avgDeliveryDelayDays.toFixed(1)} jours sur les ETA fournisseurs.`,
    });
  }

  if (metrics.consolidationRatio !== null && metrics.consolidationRatio < 0.5) {
    score += 10;
    factors.push({
      factor: "Consolidation incomplète",
      impact: "medium",
      detail: `Seulement ${(metrics.consolidationRatio * 100).toFixed(0)}% des commandes ont rejoint la station de consolidation.`,
    });
  }

  if (metrics.warningAnomaliesCount > 0) {
    score += Math.min(10, metrics.warningAnomaliesCount * 5);
    factors.push({
      factor: "Anomalies warning",
      impact: "low",
      detail: `${metrics.warningAnomaliesCount} avertissement(s) en attente d'action.`,
    });
  }

  if (metrics.daysOld > 60) {
    score += 5;
    factors.push({
      factor: "Dossier ancien",
      impact: "low",
      detail: `Dossier ouvert depuis ${metrics.daysOld} jours — risque d'oubli ou de désengagement client.`,
    });
  }

  score = Math.min(100, score);

  const level: RiskAnalysis["level"] =
    score <= 25 ? "low" :
    score <= 50 ? "medium" :
    score <= 75 ? "high" : "critical";

  const summaries: Record<RiskAnalysis["level"], string> = {
    low: "Le projet présente un niveau de risque faible. Les principaux indicateurs sont dans les normes attendues.",
    medium: "Le projet présente quelques signaux d'alerte modérés nécessitant une surveillance accrue.",
    high: "Le projet présente un risque élevé avec plusieurs facteurs critiques pouvant impacter la livraison.",
    critical: "Situation critique détectée. Une intervention immédiate est recommandée pour éviter un blocage total.",
  };

  const recommendations: Record<RiskAnalysis["level"], string> = {
    low: "Maintenir le suivi standard et vérifier les prochaines échéances.",
    medium: "Contacter le coordinateur projet pour un point de situation et prioriser la résolution des anomalies en attente.",
    high: "Escalader immédiatement au responsable logistique et initier un plan d'action avec les fournisseurs concernés.",
    critical: "Déclencher un plan d'urgence : appeler le client, bloquer les nouvelles commandes, mobiliser l'équipe terrain.",
  };

  return {
    risk_score: score,
    level,
    summary: summaries[level],
    factors: factors.length > 0 ? factors : [{ factor: "Aucun signal", impact: "low", detail: "Aucun facteur de risque détecté à ce stade." }],
    recommendation: recommendations[level],
    generated_at: new Date().toISOString(),
    cached: false,
  };
}

// ---------------------------------------------------------------------------
// Analyse principale
// ---------------------------------------------------------------------------

export async function analyzeProjectRisk(projectId: string): Promise<RiskAnalysis | null> {
  // 1. Vérifier le cache
  const cached = getCached(projectId);
  if (cached) return cached;

  // 2. Charger le projet depuis la DB
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      orders: {
        include: {
          lines: true,
          shipments: true,
          steps: true,
        },
      },
      consolidation: true,
      last_mile: true,
      installation: true,
      notifications: {
        where: { status: "sent" },
        include: { rule: { select: { severity: true, name: true } } },
      },
      steps: true,
    },
  });

  if (!project) return null;

  // 3. Calculer les métriques dérivées
  const daysOld = Math.floor((Date.now() - project.created_at.getTime()) / (1000 * 60 * 60 * 24));

  const allLines = project.orders.flatMap((o) => o.lines);
  const shortageCount = allLines.filter(
    (l) => l.stock_status === "shortage" || l.stock_status === "backordered",
  ).length;

  const inTransitShipments = project.orders
    .flatMap((o) => o.shipments)
    .filter((s) => s.status === "in_transit" || s.status === "dispatched");

  const lateShipmentsCount = inTransitShipments.filter((s) => {
    if (!s.estimated_arrival) return false;
    const order = project.orders.find((o) => o.shipments.some((sh) => sh.id === s.id));
    if (!order?.promised_delivery_date) return false;
    return s.estimated_arrival > order.promised_delivery_date;
  }).length;

  const delayDays: number[] = [];
  for (const order of project.orders) {
    if (!order.promised_delivery_date) continue;
    for (const shipment of order.shipments) {
      if (shipment.status !== "arrived" && shipment.estimated_arrival) {
        const delay =
          (shipment.estimated_arrival.getTime() - order.promised_delivery_date.getTime()) /
          (1000 * 60 * 60 * 24);
        if (delay > 0) delayDays.push(delay);
      }
    }
  }
  const avgDeliveryDelayDays =
    delayDays.length > 0 ? delayDays.reduce((a, b) => a + b, 0) / delayDays.length : null;

  const consolidationRatio =
    project.consolidation && project.consolidation.orders_required.length > 0
      ? project.consolidation.orders_arrived.length / project.consolidation.orders_required.length
      : null;

  const allSteps = [
    ...project.steps,
    ...project.orders.flatMap((o) => o.steps),
    ...(project.installation ? [] : []), // installation.steps loaded via separate relation
  ];
  const completedStepsRate =
    allSteps.length > 0
      ? allSteps.filter((s) => s.status === "completed").length / allSteps.length
      : 1;

  const criticalAnomaliesCount = project.notifications.filter(
    (n) => n.rule?.severity === "critical",
  ).length;
  const warningAnomaliesCount = project.notifications.filter(
    (n) => n.rule?.severity === "warning",
  ).length;

  const metrics: Metrics = {
    daysOld,
    shortageCount,
    lateShipmentsCount,
    avgDeliveryDelayDays,
    consolidationRatio,
    completedStepsRate,
    criticalAnomaliesCount,
    warningAnomaliesCount,
  };

  // 4. Charger les stats historiques
  const [totalProjects, totalNotifs, totalCriticalNotifs] = await Promise.all([
    prisma.project.count(),
    prisma.notification.count(),
    prisma.notification.count({ where: { rule: { severity: "critical" } } }),
  ]);

  const historicalStats: HistoricalStats = { totalProjects, totalNotifs, totalCriticalNotifs };

  // 5. Appel Claude ou fallback heuristique
  let analysis: RiskAnalysis;

  if (!config.ANTHROPIC_API_KEY) {
    analysis = heuristicAnalysis(metrics);
  } else {
    try {
      const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildUserPrompt(project, metrics, historicalStats),
          },
        ],
      });

      const rawText = response.content[0].type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(rawText) as {
        risk_score: number;
        level: string;
        summary: string;
        factors: Array<{ factor: string; impact: string; detail: string }>;
        recommendation: string;
      };

      analysis = {
        risk_score: Math.max(0, Math.min(100, Math.round(parsed.risk_score))),
        level: (["low", "medium", "high", "critical"].includes(parsed.level)
          ? parsed.level
          : "medium") as RiskAnalysis["level"],
        summary: parsed.summary ?? "",
        factors: (parsed.factors ?? []).map((f) => ({
          factor: f.factor,
          impact: (["low", "medium", "high"].includes(f.impact) ? f.impact : "low") as RiskFactor["impact"],
          detail: f.detail,
        })),
        recommendation: parsed.recommendation ?? "",
        generated_at: new Date().toISOString(),
        cached: false,
      };
    } catch {
      // Fallback heuristique si erreur API ou JSON invalide
      analysis = heuristicAnalysis(metrics);
    }
  }

  // 6. Mettre en cache et retourner
  setCached(projectId, analysis);
  return analysis;
}
