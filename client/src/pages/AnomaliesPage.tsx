import { useState, useEffect } from "react";
import { useAnomalies, useAcknowledge, useBulkAcknowledge, downloadCsv } from "../lib/api.ts";
import type { AnomalyNotification, AnomalyFilters } from "../lib/api.ts";
import SeverityBadge from "../components/SeverityBadge.tsx";
import Pagination from "../components/Pagination.tsx";
import { formatDate, projectTypeLabel } from "../lib/utils.ts";
import { CheckCircle, RefreshCw, CheckSquare, Download, X } from "lucide-react";

// =============================================================================
// AnomalyCard
// =============================================================================

interface AnomalyCardProps {
  anomaly: AnomalyNotification;
  checked: boolean;
  onToggle: (id: string) => void;
}

function AnomalyCard({ anomaly, checked, onToggle }: AnomalyCardProps) {
  const { mutate: acknowledge, isPending } = useAcknowledge();
  const [ackBy, setAckBy] = useState("");
  const [showAckForm, setShowAckForm] = useState(false);

  const isAcked = Boolean(anomaly.event?.acknowledged_by);

  return (
    <div
      className={`bg-white rounded-lg border p-4 transition-colors ${
        checked ? "border-blue-300 bg-blue-50/30" : isAcked ? "border-slate-200 opacity-60" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <label className="flex items-center pt-0.5 flex-shrink-0 cursor-pointer" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={checked}
            disabled={isAcked}
            onChange={() => onToggle(anomaly.id)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          />
        </label>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {anomaly.rule && <SeverityBadge severity={anomaly.rule.severity} size="sm" />}
            <span className="font-semibold text-slate-800 text-sm">
              {anomaly.rule?.name ?? "Règle inconnue"}
            </span>
            {anomaly.rule && (
              <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {anomaly.rule.scope}
              </span>
            )}
          </div>

          {anomaly.project && (
            <p className="text-xs text-slate-600">
              Client : <span className="font-medium">{anomaly.project.customer_id}</span>
              {" — "}{projectTypeLabel(anomaly.project.project_type)}
            </p>
          )}

          {anomaly.event && (
            <p className="text-xs text-slate-500 font-mono mt-0.5">{anomaly.event.event_type}</p>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
            <span>Envoyé le {formatDate(anomaly.sent_at)}</span>
            <span>→ {anomaly.recipient}</span>
          </div>

          {isAcked && (
            <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" />
              Acquitté par {anomaly.event?.acknowledged_by}
            </p>
          )}
        </div>

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
                  onClick={() => { if (ackBy.trim()) acknowledge({ id: anomaly.id, acknowledged_by: ackBy.trim() }); }}
                  disabled={isPending || !ackBy.trim()}
                  className="text-xs bg-blue-600 text-white rounded px-2 py-1 hover:bg-blue-700 disabled:opacity-50"
                >
                  OK
                </button>
                <button onClick={() => setShowAckForm(false)} className="text-xs text-slate-400 hover:text-slate-600">
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

// =============================================================================
// AnomaliesPage
// =============================================================================

export default function AnomaliesPage() {
  const [filters, setFilters] = useState<AnomalyFilters>({});
  const [rawCustomer, setRawCustomer] = useState("");
  const [rawRule, setRawRule] = useState("");
  const [page, setPage] = useState(1);

  const goToPage = (p: number) => {
    setPage(p);
    setFilters((prev) => ({ ...prev, page: p }));
  };

  // Debounce 300ms sur les champs texte
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) => {
        const next = { ...prev, page: 1 };
        if (rawCustomer) next.customer_id = rawCustomer; else delete next.customer_id;
        return next;
      });
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [rawCustomer]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) => {
        const next = { ...prev, page: 1 };
        if (rawRule) next.rule_name = rawRule; else delete next.rule_name;
        return next;
      });
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [rawRule]);

  const { data, isLoading, error, refetch, isFetching } = useAnomalies(filters);

  // Bulk acknowledgment
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAckBy, setBulkAckBy] = useState("");
  const bulkAck = useBulkAcknowledge();

  // CSV export
  const [isExporting, setIsExporting] = useState(false);

  const { anomalies = [], total = 0, pages = 1 } = data ?? {};
  const unackedAnomalies = anomalies.filter((a) => !a.event?.acknowledged_by);
  const critical = anomalies.filter((a) => a.rule?.severity === "critical");
  const warning  = anomalies.filter((a) => a.rule?.severity === "warning");
  const other    = anomalies.filter((a) => !a.rule || !["critical", "warning"].includes(a.rule.severity));

  const hasFilters = rawCustomer !== "" || rawRule !== "" || Object.keys(filters).filter((k) => k !== "page" && k !== "limit").length > 0;

  const resetFilters = () => {
    setFilters({ page: 1 });
    setRawCustomer("");
    setRawRule("");
    setPage(1);
  };

  const setSeverity = (s: string | undefined) => {
    setPage(1);
    setFilters((prev) => {
      const next = { ...prev, page: 1 };
      if (s) next.severity = s; else delete next.severity;
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkAck = () => {
    if (!bulkAckBy.trim() || selected.size === 0) return;
    bulkAck.mutate(
      { ids: [...selected], acknowledged_by: bulkAckBy.trim() },
      {
        onSuccess: () => {
          setSelected(new Set());
          setShowBulkModal(false);
          setBulkAckBy("");
        },
      }
    );
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (filters.status)      params.set("status",      filters.status);
      if (filters.severity)    params.set("severity",    filters.severity);
      if (filters.from)        params.set("from",        filters.from);
      if (filters.to)          params.set("to",          filters.to);
      if (filters.customer_id) params.set("customer_id", filters.customer_id);
      if (filters.rule_name)   params.set("rule_name",   filters.rule_name);
      const qs = params.toString() ? `?${params.toString()}` : "";
      await downloadCsv(
        `/api/anomalies/export.csv${qs}`,
        `anomalies-${new Date().toISOString().slice(0, 10)}.csv`
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Anomalies actives</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} notification{total > 1 ? "s" : ""} (30 derniers jours)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleExport()}
            disabled={isExporting}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-green-600 border border-slate-200 rounded px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {isExporting ? "Export…" : "Exporter CSV"}
          </button>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-3 py-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-5">
        {/* Sévérité */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Sévérité :</span>
          {(["all", "critical", "warning"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(s === "all" ? undefined : s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                (s === "all" ? !filters.severity : filters.severity === s)
                  ? "bg-slate-800 text-white border-slate-800"
                  : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              {s === "all" ? "Toutes" : s === "critical" ? "Critiques" : "Warnings"}
            </button>
          ))}
        </div>

        {/* Date du */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Du</span>
          <input
            type="date"
            value={filters.from ?? ""}
            onChange={(e) => { setPage(1); setFilters((prev) => {
              const next = { ...prev, page: 1 };
              if (e.target.value) next.from = e.target.value; else delete next.from;
              return next;
            }); }}
            className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600 focus:outline-none focus:border-blue-400"
          />
        </div>

        {/* Date au */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">au</span>
          <input
            type="date"
            value={filters.to ?? ""}
            onChange={(e) => { setPage(1); setFilters((prev) => {
              const next = { ...prev, page: 1 };
              if (e.target.value) next.to = e.target.value; else delete next.to;
              return next;
            }); }}
            className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600 focus:outline-none focus:border-blue-400"
          />
        </div>

        {/* Client */}
        <input
          type="text"
          value={rawCustomer}
          onChange={(e) => setRawCustomer(e.target.value)}
          placeholder="Client…"
          className="text-sm border border-slate-200 rounded px-3 py-1.5 w-36 focus:outline-none focus:border-blue-400"
        />

        {/* Règle */}
        <input
          type="text"
          value={rawRule}
          onChange={(e) => setRawRule(e.target.value)}
          placeholder="Règle…"
          className="text-sm border border-slate-200 rounded px-3 py-1.5 w-36 focus:outline-none focus:border-blue-400"
        />

        {/* Réinitialiser */}
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 border border-slate-200 rounded px-2.5 py-1.5 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Réinitialiser
          </button>
        )}

        {/* Sélectionner tout */}
        {unackedAnomalies.length > 0 && (
          <button
            onClick={() =>
              selected.size === unackedAnomalies.length
                ? setSelected(new Set())
                : setSelected(new Set(unackedAnomalies.map((a) => a.id)))
            }
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-2.5 py-1 transition-colors ml-auto"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selected.size === unackedAnomalies.length ? "Désélectionner tout" : "Tout sélectionner"}
          </button>
        )}
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
                  <AnomalyCard key={a.id} anomaly={a} checked={selected.has(a.id)} onToggle={toggleSelect} />
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
                  <AnomalyCard key={a.id} anomaly={a} checked={selected.has(a.id)} onToggle={toggleSelect} />
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
                  <AnomalyCard key={a.id} anomaly={a} checked={selected.has(a.id)} onToggle={toggleSelect} />
                ))}
              </div>
            </section>
          )}
          {pages > 1 && (
            <div className="mt-4">
              <Pagination page={page} pages={pages} total={total} label="anomalie" onPage={goToPage} />
            </div>
          )}
        </div>
      )}

      {/* Sticky bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-56 right-0 bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between shadow-lg z-40">
          <span className="text-sm text-slate-600">
            <span className="font-semibold text-blue-600">{selected.size}</span> anomalie{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelected(new Set())}
              className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded px-3 py-1.5 transition-colors"
            >
              Désélectionner
            </button>
            <button
              onClick={() => setShowBulkModal(true)}
              className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 transition-colors"
            >
              Acquitter tout ({selected.size})
            </button>
          </div>
        </div>
      )}

      {/* Bulk ack modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              Acquitter {selected.size} anomalie{selected.size > 1 ? "s" : ""}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Indiquez votre nom pour confirmer l'acquittement en masse.
            </p>
            <input
              autoFocus
              value={bulkAckBy}
              onChange={(e) => setBulkAckBy(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBulkAck()}
              placeholder="Votre nom…"
              className="w-full border border-slate-200 rounded px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowBulkModal(false); setBulkAckBy(""); }}
                className="text-sm border border-slate-200 rounded px-4 py-2 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleBulkAck}
                disabled={!bulkAckBy.trim() || bulkAck.isPending}
                className="text-sm bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {bulkAck.isPending ? "En cours…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
