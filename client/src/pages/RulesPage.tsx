import { useRules, useToggleRule } from "../lib/api.ts";
import SeverityBadge from "../components/SeverityBadge.tsx";
import { formatDate } from "../lib/utils.ts";

export default function RulesPage() {
  const { data, isLoading, error } = useRules();
  const { mutate: toggleRule, isPending } = useToggleRule();

  const rules = data?.rules ?? [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Règles d'anomalie</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {rules.length} règle{rules.length > 1 ? "s" : ""} configurées
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Chargement...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
          Erreur : {error.message}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`bg-white rounded-lg border p-4 transition-opacity ${
                !rule.active ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Name + severity */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <SeverityBadge severity={rule.severity} size="sm" />
                    <span className="font-semibold text-slate-800 text-sm">
                      {rule.name}
                    </span>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">{rule.scope}</span>
                    <span className="font-mono text-slate-400">{rule.step_type}</span>
                  </div>

                  <p className="text-xs text-slate-400 mt-1.5">
                    MàJ {formatDate(rule.updated_at)}
                  </p>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggleRule({ id: rule.id, active: !rule.active })}
                  disabled={isPending}
                  title={rule.active ? "Désactiver la règle" : "Activer la règle"}
                  className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${
                    rule.active ? "bg-blue-500" : "bg-slate-200"
                  } disabled:opacity-50`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      rule.active ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
