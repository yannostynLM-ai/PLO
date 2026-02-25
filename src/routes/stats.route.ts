import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// Route GET /api/stats — Dashboard KPIs anomalies (Sprint 6)
// =============================================================================

export async function statsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/stats", async (_req, reply) => {
    const now = new Date();
    const since30d = new Date(now.getTime() - 30 * 24 * 3_600_000);
    const since7d = new Date(now.getTime() - 7 * 24 * 3_600_000);
    const since14d = new Date(now.getTime() - 14 * 24 * 3_600_000);

    // Toutes les notifications des 30 derniers jours avec règle + event
    const notifications = await prisma.notification.findMany({
      where: { created_at: { gte: since30d } },
      include: {
        rule: { select: { id: true, name: true, severity: true } },
        event: { select: { acknowledged_by: true, processed_at: true } },
      },
    });

    // ── Totaux ────────────────────────────────────────────────────────────────
    const total_notifications = notifications.length;

    // Par statut
    const by_status: Record<string, number> = {};
    for (const n of notifications) {
      by_status[n.status] = (by_status[n.status] ?? 0) + 1;
    }

    // Par sévérité (via règle)
    const by_severity: Record<string, number> = {};
    for (const n of notifications) {
      const sev = n.rule?.severity ?? "unknown";
      by_severity[sev] = (by_severity[sev] ?? 0) + 1;
    }

    // ── Acquittement ──────────────────────────────────────────────────────────
    const acknowledged_count = notifications.filter(
      (n) => n.event?.acknowledged_by != null
    ).length;
    const acknowledgement_rate =
      total_notifications > 0
        ? Math.round((acknowledged_count / total_notifications) * 100) / 100
        : 0;

    // MTTA — Mean Time To Acknowledge (en heures)
    // Proxy : event.processed_at → sent_at delta pour les notifs acquittées
    const acknowledgedWithTime = notifications.filter(
      (n) => n.event?.acknowledged_by != null && n.sent_at != null && n.event?.processed_at != null
    );
    let mean_time_to_acknowledge_hours: number | null = null;
    if (acknowledgedWithTime.length > 0) {
      const totalMs = acknowledgedWithTime.reduce((sum, n) => {
        const ackMs = n.event!.processed_at!.getTime();
        const sentMs = n.sent_at!.getTime();
        return sum + Math.abs(ackMs - sentMs);
      }, 0);
      mean_time_to_acknowledge_hours =
        Math.round((totalMs / acknowledgedWithTime.length / 3_600_000) * 10) / 10;
    }

    // ── Escalades & tickets CRM ───────────────────────────────────────────────
    const escalated_count = await prisma.notification.count({
      where: { escalated_at: { not: null } },
    });

    const crm_tickets_created = await prisma.notification.count({
      where: { crm_ticket_ref: { not: null } },
    });

    // ── Top 5 règles ──────────────────────────────────────────────────────────
    const ruleCountMap = new Map<string, number>();
    for (const n of notifications) {
      if (n.rule_id) {
        ruleCountMap.set(n.rule_id, (ruleCountMap.get(n.rule_id) ?? 0) + 1);
      }
    }

    const ruleEntries = Array.from(ruleCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const top_rules = ruleEntries.map(([rule_id, count]) => {
      const rule = notifications.find((n) => n.rule_id === rule_id)?.rule;
      return {
        rule_id,
        rule_name: rule?.name ?? rule_id,
        count,
        severity: rule?.severity ?? "unknown",
      };
    });

    // ── Projets actifs avec anomalies ─────────────────────────────────────────
    const active_projects_with_anomalies = await prisma.project.count({
      where: {
        notifications: {
          some: {
            status: "sent",
            escalated_at: null,
            created_at: { gte: since30d },
          },
        },
      },
    });

    // ── Tendance 7j ───────────────────────────────────────────────────────────
    const trend_current_7d = notifications.filter(
      (n) => n.created_at >= since7d
    ).length;

    const trend_previous_7d = notifications.filter(
      (n) => n.created_at >= since14d && n.created_at < since7d
    ).length;

    return reply.send({
      period_days: 30,
      total_notifications,
      by_severity,
      by_status,
      acknowledged_count,
      acknowledgement_rate,
      mean_time_to_acknowledge_hours,
      escalated_count,
      crm_tickets_created,
      top_rules,
      active_projects_with_anomalies,
      trend_current_7d,
      trend_previous_7d,
    });
  });
}
