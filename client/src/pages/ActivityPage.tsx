import { useState, useCallback } from "react";
import { RefreshCw, ClipboardList, X } from "lucide-react";
import { useActivity, type ActivityEntry, type ActivityFilters } from "../lib/api.ts";

// =============================================================================
// Journal d'activité — Sprint 16
// =============================================================================

const ACTION_LABELS: Record<string, string> = {
  anomaly_acknowledged:      "Acquittement",
  anomaly_bulk_acknowledged: "Acquittement en masse",
  project_status_changed:    "Statut modifié",
  project_note_added:        "Note ajoutée",
  project_created:           "Projet créé",
  project_assigned:              "Attribution",         // Sprint 18
  partial_delivery_approved:     "Livr. partielle",    // Sprint 20
  rule_created:              "Règle créée",
  rule_updated:              "Règle modifiée",
  rule_deleted:              "Règle supprimée",
  user_created:              "Utilisateur créé",
  user_deleted:              "Utilisateur supprimé",
};

const ACTION_BADGE: Record<string, string> = {
  anomaly_acknowledged:      "bg-blue-100 text-blue-800",
  anomaly_bulk_acknowledged: "bg-blue-100 text-blue-800",
  project_status_changed:    "bg-blue-100 text-blue-800",
  project_note_added:        "bg-slate-100 text-slate-700",
  project_created:           "bg-green-100 text-green-800",
  project_assigned:              "bg-blue-100 text-blue-800",    // Sprint 18
  partial_delivery_approved:     "bg-amber-100 text-amber-700", // Sprint 20
  rule_created:              "bg-green-100 text-green-800",
  rule_updated:              "bg-blue-100 text-blue-800",
  rule_deleted:              "bg-orange-100 text-orange-800",
  user_created:              "bg-green-100 text-green-800",
  user_deleted:              "bg-orange-100 text-orange-800",
};

const ENTITY_LABELS: Record<string, string> = {
  anomaly: "Anomalie",
  project: "Projet",
  rule:    "Règle",
  user:    "Utilisateur",
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_BADGE[action] ?? "bg-slate-100 text-slate-700";
  const label = ACTION_LABELS[action] ?? action;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function DetailsCell({ details }: { details: unknown }) {
  if (details === null || details === undefined) return <span className="text-slate-400">—</span>;

  // project_status_changed: { from, to }
  if (
    typeof details === "object" &&
    "from" in (details as object) &&
    "to" in (details as object)
  ) {
    const d = details as { from: string; to: string };
    return (
      <span className="text-xs font-mono text-slate-600">
        {d.from} → {d.to}
      </span>
    );
  }

  // bulk ack: { count }
  if (typeof details === "object" && "count" in (details as object)) {
    const d = details as { count: number };
    return <span className="text-xs text-slate-600">{d.count} anomalie(s)</span>;
  }

  return (
    <span className="text-xs font-mono text-slate-500">
      {JSON.stringify(details)}
    </span>
  );
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback(
    (v: string) => {
      if (timer) clearTimeout(timer);
      const t = setTimeout(() => setDebounced(v), delay);
      setTimer(t);
    },
    [timer, delay]
  );

  return [debounced, update] as const;
}

export default function ActivityPage() {
  const [entityType, setEntityType] = useState("");
  const [operatorInput, setOperatorInput] = useState("");
  const [debouncedOp, setDebouncedOp] = useDebounce("", 300);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const handleOperatorChange = (v: string) => {
    setOperatorInput(v);
    setDebouncedOp(v);
  };

  const filters: ActivityFilters = {
    ...(entityType    ? { entity_type: entityType }  : {}),
    ...(debouncedOp   ? { operator: debouncedOp }    : {}),
    ...(fromDate      ? { from: fromDate }            : {}),
    ...(toDate        ? { to: toDate }                : {}),
    limit: 50,
  };

  const { data, isFetching, refetch } = useActivity(filters);

  const entries: ActivityEntry[] = data?.entries ?? [];
  const total = data?.total ?? 0;

  const handleReset = () => {
    setEntityType("");
    setOperatorInput("");
    setDebouncedOp("");
    setFromDate("");
    setToDate("");
  };

  const hasFilters = entityType || operatorInput || fromDate || toDate;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-slate-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Journal d'activité</h1>
            <p className="text-sm text-slate-500">
              {total} entrée{total > 1 ? "s" : ""} au total
              {entries.length < total ? ` · ${entries.length} affichées` : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-slate-300
                     rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Type d'entité */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Type</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none
                         focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Tous</option>
              <option value="anomaly">Anomalie</option>
              <option value="project">Projet</option>
              <option value="rule">Règle</option>
              <option value="user">Utilisateur</option>
            </select>
          </div>

          {/* Opérateur */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Opérateur</label>
            <input
              type="text"
              value={operatorInput}
              onChange={(e) => handleOperatorChange(e.target.value)}
              placeholder="Nom ou email…"
              className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none
                         focus:ring-2 focus:ring-blue-500 w-44"
            />
          </div>

          {/* Du */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Du</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none
                         focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Au */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Au</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none
                         focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {hasFilters && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600
                         hover:text-slate-900 border border-slate-300 rounded-md
                         hover:bg-slate-50 transition-colors"
            >
              <X className="h-4 w-4" />
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {entries.length === 0 && !isFetching ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            Aucune entrée dans le journal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Entité
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Opérateur
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Détails
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {ENTITY_LABELS[entry.entity_type] ?? entry.entity_type}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      {entry.entity_label ?? entry.entity_id ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {entry.operator_name}
                    </td>
                    <td className="px-4 py-3">
                      <DetailsCell details={entry.details} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
