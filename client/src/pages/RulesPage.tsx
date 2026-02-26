import { useState } from "react";
import {
  useRules,
  useToggleRule,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useCurrentUser,
} from "../lib/api.ts";
import type { AnomalyRule } from "../lib/api.ts";
import SeverityBadge from "../components/SeverityBadge.tsx";
import { formatDate } from "../lib/utils.ts";
import { Plus, Pencil, Trash2, X } from "lucide-react";

// =============================================================================
// RuleFormModal — création ou édition d'une règle (admin)
// =============================================================================

interface RuleFormModalProps {
  rule?: AnomalyRule;
  onClose: () => void;
}

const SCOPE_OPTIONS = [
  { value: "project",       label: "project" },
  { value: "order",         label: "order" },
  { value: "consolidation", label: "consolidation" },
  { value: "lastmile",      label: "lastmile" },
  { value: "installation",  label: "installation" },
] as const;

function RuleFormModal({ rule, onClose }: RuleFormModalProps) {
  const isEdit = Boolean(rule);
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();

  const [name,         setName]         = useState(rule?.name ?? "");
  const [scope,        setScope]        = useState(rule?.scope ?? "project");
  const [stepType,     setStepType]     = useState(rule?.step_type ?? "");
  const [severity,     setSeverity]     = useState<"warning" | "critical">(rule?.severity ?? "warning");
  const [conditionStr, setConditionStr] = useState(
    rule?.condition ? JSON.stringify(rule.condition, null, 2) : "{}"
  );
  const [actionStr, setActionStr] = useState(
    rule?.action ? JSON.stringify(rule.action, null, 2) : "{}"
  );
  const [active,   setActive]   = useState(rule?.active ?? true);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  const isPending = createRule.isPending || updateRule.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let condParsed: Record<string, unknown>;
    let actParsed: Record<string, unknown>;
    try { condParsed = JSON.parse(conditionStr) as Record<string, unknown>; }
    catch { setError("condition : JSON invalide"); return; }
    try { actParsed = JSON.parse(actionStr) as Record<string, unknown>; }
    catch { setError("action : JSON invalide"); return; }

    try {
      if (isEdit && rule) {
        await updateRule.mutateAsync({
          id: rule.id,
          name,
          scope,
          step_type: stepType,
          severity,
          condition: condParsed,
          action: actParsed,
          active,
        });
      } else {
        await createRule.mutateAsync({
          name,
          scope,
          step_type: stepType,
          severity,
          condition: condParsed,
          action: actParsed,
          active,
        });
      }
      setSuccess(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  const inputCls = "w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? "Modifier la règle" : "Nouvelle règle d'anomalie"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputCls}
              placeholder="Ex: ANO-23 — Retard picking critique"
            />
          </div>

          {/* Scope + Severity row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Scope</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
                className={inputCls}
              >
                {SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Sévérité</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as "warning" | "critical")}
                className={inputCls}
              >
                <option value="warning">warning</option>
                <option value="critical">critical</option>
              </select>
            </div>
          </div>

          {/* Step type */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Step type</label>
            <input
              type="text"
              value={stepType}
              onChange={(e) => setStepType(e.target.value)}
              required
              className={inputCls}
              placeholder="Ex: shipment_arrived_at_station"
            />
          </div>

          {/* Condition JSON */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Condition <span className="font-normal text-slate-400">(JSON)</span>
            </label>
            <textarea
              rows={4}
              value={conditionStr}
              onChange={(e) => setConditionStr(e.target.value)}
              className={`${inputCls} font-mono text-xs`}
            />
          </div>

          {/* Action JSON */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Action <span className="font-normal text-slate-400">(JSON)</span>
            </label>
            <textarea
              rows={4}
              value={actionStr}
              onChange={(e) => setActionStr(e.target.value)}
              className={`${inputCls} font-mono text-xs`}
            />
          </div>

          {/* Active */}
          <div className="flex items-center gap-2">
            <input
              id="rule-active"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="rule-active" className="text-sm text-slate-700">Règle active</label>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              {isEdit ? "Règle mise à jour ✓" : "Règle créée ✓"}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-slate-600 border border-slate-200 rounded px-4 py-2 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isPending || success}
              className="text-sm bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// RulesPage
// =============================================================================

export default function RulesPage() {
  const { data, isLoading, error } = useRules();
  const { mutate: toggleRule, isPending: isToggling } = useToggleRule();
  const deleteRule = useDeleteRule();
  const { data: authData } = useCurrentUser();
  const isAdmin = authData?.user?.role === "admin";

  const rules = data?.rules ?? [];

  const [showCreate,      setShowCreate]      = useState(false);
  const [editRule,        setEditRule]        = useState<AnomalyRule | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError,     setDeleteError]     = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeleteError(null);
    try {
      await deleteRule.mutateAsync(id);
      setConfirmDeleteId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erreur suppression");
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Règles d'anomalie</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {rules.length} règle{rules.length > 1 ? "s" : ""} configurées
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-sm bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nouvelle règle
          </button>
        )}
      </div>

      {/* Delete error */}
      {deleteError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm flex items-center justify-between">
          {deleteError}
          <button onClick={() => setDeleteError(null)} className="ml-2 text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Admin: edit + delete */}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => setEditRule(rule)}
                        title="Modifier la règle"
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      {confirmDeleteId === rule.id ? (
                        <span className="flex items-center gap-1 text-xs">
                          <button
                            onClick={() => void handleDelete(rule.id)}
                            className="text-red-600 font-medium hover:text-red-700"
                          >
                            Oui
                          </button>
                          <span className="text-slate-300">/</span>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-slate-500 hover:text-slate-700"
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(rule.id)}
                          title="Supprimer la règle"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  )}

                  {/* Toggle */}
                  <button
                    onClick={() => toggleRule({ id: rule.id, active: !rule.active })}
                    disabled={isToggling}
                    title={rule.active ? "Désactiver la règle" : "Activer la règle"}
                    className={`w-11 h-6 rounded-full transition-colors relative ${
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
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && <RuleFormModal onClose={() => setShowCreate(false)} />}
      {editRule   && <RuleFormModal rule={editRule} onClose={() => setEditRule(null)} />}
    </div>
  );
}
