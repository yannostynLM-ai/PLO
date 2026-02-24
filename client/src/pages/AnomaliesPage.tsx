import { useState } from "react";
import { useAnomalies, useAcknowledge } from "../lib/api.ts";
import type { AnomalyNotification } from "../lib/api.ts";
import SeverityBadge from "../components/SeverityBadge.tsx";
import { formatDate, projectTypeLabel } from "../lib/utils.ts";
import { CheckCircle, RefreshCw } from "lucide-react";

function AnomalyCard({ anomaly }: { anomaly: AnomalyNotification }) {
  const { mutate: acknowledge, isPending } = useAcknowledge();
  const [ackBy, setAckBy] = useState("");
  const [showAckForm, setShowAckForm] = useState(false);

  const isAcked = Boolean(anomaly.event?.acknowledged_by);

  return (
    <div
      className={`bg-white rounded-lg border p-4 ${
        isAcked ? "border-slate-200 opacity-60" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Rule + severity */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {anomaly.rule && (
              <SeverityBadge severity={anomaly.rule.severity} size="sm" />
            )}
            <span className="font-semibold text-slate-800 text-sm">
              {anomaly.rule?.name ?? "Règle inconnue"}
            </span>
            {anomaly.rule && (
              <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {anomaly.rule.scope}
              </span>
            )}
          </div>

          {/* Project */}
          {anomaly.project && (
            <p className="text-xs text-slate-600">
              Client : <span className="font-medium">{anomaly.project.customer_id}</span>
              {" — "}{projectTypeLabel(anomaly.project.project_type)}
            </p>
          )}

          {/* Event type */}
          {anomaly.event && (
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {anomaly.event.event_type}
            </p>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
            <span>Envoyé le {formatDate(anomaly.sent_at)}</span>
            <span>→ {anomaly.recipient}</span>
          </div>

          {/* Acked */}
          {isAcked && (
            <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" />
              Acquitté par {anomaly.event?.acknowledged_by}
            </p>
          )}
        </div>

        {/* Acknowledge button */}
        {!isAcked && (
          <div className="flex-shrink-0">
            {!showAckForm ? (
              <button
                onClick={() => setShowAckForm(true)}
                className="text-xs border border-slate-200 rounded px-2.5 py-1.5 text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                Acquitter
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={ackBy}
                  onChange={(e) => setAckBy(e.target.value)}
                  placeholder="Votre nom"
                  className="border rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={() => {
                    if (ackBy.trim()) {
                      acknowledge({ id: anomaly.id, acknowledged_by: ackBy.trim() });
                    }
                  }}
                  disabled={isPending || !ackBy.trim()}
                  className="text-xs bg-blue-600 text-white rounded px-2 py-1 hover:bg-blue-700 disabled:opacity-50"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowAckForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnomaliesPage() {
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning">("all");
  const { data, isLoading, error, refetch, isFetching } = useAnomalies(
    severityFilter !== "all" ? { severity: severityFilter } : undefined
  );

  const anomalies = data?.anomalies ?? [];

  // Group by severity
  const critical = anomalies.filter((a) => a.rule?.severity === "critical");
  const warning = anomalies.filter((a) => a.rule?.severity === "warning");
  const other = anomalies.filter((a) => !a.rule || !["critical", "warning"].includes(a.rule.severity));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Anomalies actives</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {anomalies.length} notification{anomalies.length > 1 ? "s" : ""} (30 derniers jours)
          </p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-3 py-1.5"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xs font-medium text-slate-500">Sévérité :</span>
        {(["all", "critical", "warning"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSeverityFilter(s)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              severityFilter === s
                ? "bg-slate-800 text-white border-slate-800"
                : "border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
          >
            {s === "all" ? "Toutes" : s === "critical" ? "Critiques" : "Warnings"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Chargement...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
          Erreur : {error.message}
        </div>
      ) : anomalies.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Aucune anomalie trouvée</div>
      ) : (
        <div className="space-y-6">
          {critical.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-red-700 mb-3 uppercase tracking-wide">
                Critiques ({critical.length})
              </h2>
              <div className="space-y-3">
                {critical.map((a) => (
                  <AnomalyCard key={a.id} anomaly={a} />
                ))}
              </div>
            </section>
          )}
          {warning.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-orange-600 mb-3 uppercase tracking-wide">
                Warnings ({warning.length})
              </h2>
              <div className="space-y-3">
                {warning.map((a) => (
                  <AnomalyCard key={a.id} anomaly={a} />
                ))}
              </div>
            </section>
          )}
          {other.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                Autres ({other.length})
              </h2>
              <div className="space-y-3">
                {other.map((a) => (
                  <AnomalyCard key={a.id} anomaly={a} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
