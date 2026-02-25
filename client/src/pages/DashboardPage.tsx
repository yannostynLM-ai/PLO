import { useStats } from "../lib/api.ts";
import SeverityBadge from "../components/SeverityBadge.tsx";
import type { AnomalySeverity } from "../lib/api.ts";

// =============================================================================
// DashboardPage — Vue KPIs anomalies (Sprint 6)
// =============================================================================

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) {
  return (
    <div className={`bg-white rounded-lg border border-slate-200 p-5 shadow-sm`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="text-slate-400">—</span>;
  const delta = current - previous;
  const pct =
    previous > 0 ? Math.round(Math.abs((delta / previous) * 100)) : 100;
  if (delta > 0)
    return (
      <span className="text-red-600 font-semibold">
        ↑ +{delta} ({pct}%)
      </span>
    );
  if (delta < 0)
    return (
      <span className="text-green-600 font-semibold">
        ↓ {delta} ({pct}%)
      </span>
    );
  return <span className="text-slate-400">= 0%</span>;
}

export default function DashboardPage() {
  const { data: stats, isLoading, error } = useStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        Chargement des KPIs…
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-8 text-red-600">
        Erreur lors du chargement des statistiques.
      </div>
    );
  }

  const ackRatePct = Math.round(stats.acknowledgement_rate * 100);
  const ackAccent =
    ackRatePct >= 50 ? "text-green-600" : "text-orange-600";

  const maxRuleCount = Math.max(...stats.top_rules.map((r) => r.count), 1);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard KPIs</h1>
        <p className="text-sm text-slate-500 mt-1">
          Anomalies des 30 derniers jours — actualisé toutes les 60s
        </p>
      </div>

      {/* Grille 2×3 KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 mb-8">
        <KpiCard
          label="Anomalies (30j)"
          value={stats.total_notifications}
          sub={`${stats.by_status["sent"] ?? 0} envoyées`}
          accent="text-slate-800"
        />
        <KpiCard
          label="Critiques"
          value={stats.by_severity["critical"] ?? 0}
          sub={`${stats.by_severity["warning"] ?? 0} avertissements`}
          accent="text-red-600"
        />
        <KpiCard
          label="Taux d'acquittement"
          value={`${ackRatePct}%`}
          sub={`${stats.acknowledged_count} / ${stats.total_notifications} acquittées`}
          accent={ackAccent}
        />
        <KpiCard
          label="MTTA"
          value={
            stats.mean_time_to_acknowledge_hours != null
              ? `${stats.mean_time_to_acknowledge_hours}h`
              : "—"
          }
          sub="Mean Time To Acknowledge"
          accent="text-blue-600"
        />
        <KpiCard
          label="Tickets CRM"
          value={stats.crm_tickets_created}
          sub="créés automatiquement"
          accent="text-purple-600"
        />
        <KpiCard
          label="Escalades"
          value={stats.escalated_count}
          sub="notifications escaladées"
          accent="text-orange-600"
        />
      </div>

      {/* Tendance 7j et projets actifs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
            Tendance 7 jours
          </p>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.trend_current_7d}</p>
              <p className="text-xs text-slate-400">7 derniers jours</p>
            </div>
            <div className="text-sm">
              vs {stats.trend_previous_7d} (7j précédents) —{" "}
              <TrendArrow
                current={stats.trend_current_7d}
                previous={stats.trend_previous_7d}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
            Projets actifs avec anomalies
          </p>
          <p className="text-2xl font-bold text-slate-900">
            {stats.active_projects_with_anomalies}
          </p>
          <p className="text-xs text-slate-400 mt-1">projets avec alertes non escaladées</p>
        </div>
      </div>

      {/* Top 5 règles */}
      {stats.top_rules.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-4">
            Top règles déclenchées (30j)
          </p>
          <div className="space-y-3">
            {stats.top_rules.map((rule) => {
              const widthPct = Math.round((rule.count / maxRuleCount) * 100);
              const isValidSeverity =
                rule.severity === "warning" || rule.severity === "critical";
              return (
                <div key={rule.rule_id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700 truncate">
                        {rule.rule_name}
                      </span>
                      <span className="text-sm font-bold text-slate-900 ml-2">
                        {rule.count}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          rule.severity === "critical" ? "bg-red-500" : "bg-orange-400"
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                  {isValidSeverity && (
                    <SeverityBadge severity={rule.severity as AnomalySeverity} size="sm" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stats.top_rules.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400 shadow-sm">
          Aucune anomalie déclenchée sur les 30 derniers jours.
        </div>
      )}
    </div>
  );
}
