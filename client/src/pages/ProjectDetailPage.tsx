import { useParams, useNavigate } from "react-router-dom";
import { useProject, useRiskAnalysis, useUpdateProject, useAddProjectNote, useCurrentUser } from "../lib/api.ts";
import type { StepDetail, OrderDetail } from "../lib/api.ts";
import ProjectTimeline from "../components/ProjectTimeline.tsx";
import ProjectGantt from "../components/ProjectGantt.tsx";
import SeverityBadge from "../components/SeverityBadge.tsx";
import {
  formatDate,
  formatDateShort,
  projectStatusLabel,
  projectTypeLabel,
} from "../lib/utils.ts";
import { ArrowLeft, RefreshCw, Copy, Check, Brain, AlertTriangle, Loader2, ChevronDown, StickyNote } from "lucide-react";
import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Build timeline groups from project data
function buildGroups(project: {
  steps: StepDetail[];
  orders: OrderDetail[];
  installation: { steps: StepDetail[] } | null;
}) {
  const projectSteps = project.steps.filter((s) => !s.step_type.startsWith("__"));

  const orderGroups = project.orders.map((order, i) => ({
    label: `Commande ${i + 1}${order.erp_order_ref ? ` — ${order.erp_order_ref}` : ""}`,
    steps: order.steps,
  }));

  const installSteps = project.installation?.steps ?? [];

  return [
    { label: "Étapes Projet", steps: projectSteps },
    ...orderGroups,
    ...(installSteps.length > 0 ? [{ label: "Installation", steps: installSteps }] : []),
  ];
}

function TrackingTokenBlock({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/suivi/${token}`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-700 text-sm mb-2">Lien de suivi client</h3>
      <div className="flex items-center gap-2">
        <code className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1.5 rounded flex-1 truncate">
          /suivi/{token}
        </code>
        <button
          onClick={handleCopy}
          title="Copier le lien"
          className="flex-shrink-0 p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Risk panel
// ---------------------------------------------------------------------------

const LEVEL_CONFIG = {
  low: { bar: "bg-green-400", badge: "bg-green-100 text-green-700", label: "Faible" },
  medium: { bar: "bg-orange-400", badge: "bg-orange-100 text-orange-700", label: "Modéré" },
  high: { bar: "bg-red-400", badge: "bg-red-100 text-red-700", label: "Élevé" },
  critical: { bar: "bg-red-700", badge: "bg-red-200 text-red-900", label: "Critique" },
};

const IMPACT_LABEL: Record<string, string> = {
  low: "faible",
  medium: "moyen",
  high: "élevé",
};

function RiskPanel({ projectId }: { projectId: string }) {
  const [enabled, setEnabled] = useState(false);
  const qc = useQueryClient();
  const { data, isFetching, error } = useRiskAnalysis(projectId, enabled);

  const handleRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["risk", projectId] });
  }, [qc, projectId]);

  if (!enabled) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-1.5">
          <Brain className="h-4 w-4 text-purple-500" />
          Analyse IA des risques
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Analyse le projet avec Claude AI et retourne un score de risque 0–100.
        </p>
        <button
          onClick={() => setEnabled(true)}
          className="w-full text-xs font-medium px-3 py-2 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
        >
          Analyser les risques
        </button>
      </div>
    );
  }

  if (isFetching && !data) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-1.5">
          <Brain className="h-4 w-4 text-purple-500" />
          Analyse IA des risques
        </h3>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
          Analyse en cours (Claude AI)…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-red-100 p-4">
        <h3 className="font-semibold text-red-600 text-sm mb-2 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" />
          Analyse indisponible
        </h3>
        <p className="text-xs text-slate-400">{error.message}</p>
      </div>
    );
  }

  if (!data) return null;

  const cfg = LEVEL_CONFIG[data.level];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
      <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-1.5">
        <Brain className="h-4 w-4 text-purple-500" />
        Analyse IA des risques
        {data.cached && (
          <span className="text-xs font-normal text-slate-400">(mis en cache)</span>
        )}
      </h3>

      {/* Score + level */}
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold text-slate-900">{data.risk_score}</span>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
              {cfg.label}
            </span>
            <span className="text-xs text-slate-400">/100</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${cfg.bar} transition-all`}
              style={{ width: `${data.risk_score}%` }}
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-slate-600 leading-relaxed">{data.summary}</p>

      {/* Factors */}
      {data.factors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1.5">Facteurs :</p>
          <div className="space-y-1.5">
            {data.factors.map((f, i) => (
              <div key={i} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      f.impact === "high"
                        ? "bg-red-400"
                        : f.impact === "medium"
                        ? "bg-orange-400"
                        : "bg-slate-300"
                    }`}
                  />
                  <span className="font-medium text-slate-700">{f.factor}</span>
                  <span className="text-slate-400">({IMPACT_LABEL[f.impact] ?? f.impact})</span>
                </div>
                <p className="text-slate-400 mt-0.5 pl-3">{f.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendation */}
      <div className="bg-purple-50 rounded p-2.5">
        <p className="text-xs font-semibold text-purple-700 mb-0.5">Recommandation</p>
        <p className="text-xs text-purple-600">{data.recommendation}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Généré à {new Date(data.generated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="flex items-center gap-1 text-purple-500 hover:text-purple-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Rafraîchir
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useProject(id!);
  const [view, setView] = useState<"timeline" | "gantt">("timeline");

  // Sprint 15 — status editor
  const [editStatus, setEditStatus] = useState(false);
  const updateProject = useUpdateProject();

  // Sprint 15 — notes
  const addNote = useAddProjectNote();
  const { data: authData } = useCurrentUser();
  const [noteText, setNoteText] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  const project = data?.project;

  return (
    <div className="p-6 max-w-6xl">
      {/* Navigation */}
      <button
        onClick={() => void navigate("/")}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 mb-5"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux projets
      </button>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Chargement du projet...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
          Erreur : {error.message}
        </div>
      ) : !project ? null : (
        <div className="flex gap-6">
          {/* Left panel — info */}
          <aside className="w-72 flex-shrink-0 space-y-4">
            {/* Project card */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h1 className="font-bold text-slate-900 text-base">
                    {project.customer_id}
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {project.id.slice(0, 8)}…
                  </p>
                </div>
                <button
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  className="text-slate-400 hover:text-blue-600"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                </button>
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Type</dt>
                  <dd className="font-medium">{projectTypeLabel(project.project_type)}</dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-slate-500">Statut</dt>
                  <dd>
                    {editStatus ? (
                      <select
                        defaultValue={project.status}
                        autoFocus
                        onBlur={(e) => {
                          void updateProject.mutateAsync({ id: project.id, status: e.target.value });
                          setEditStatus(false);
                        }}
                        onChange={(e) => {
                          void updateProject.mutateAsync({ id: project.id, status: e.target.value });
                          setEditStatus(false);
                        }}
                        className="text-xs border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:border-blue-400"
                      >
                        <option value="draft">Brouillon</option>
                        <option value="active">Actif</option>
                        <option value="on_hold">En attente</option>
                        <option value="completed">Terminé</option>
                        <option value="cancelled">Annulé</option>
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditStatus(true)}
                        title="Modifier le statut"
                        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                      >
                        {projectStatusLabel(project.status)}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                      </button>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Canal</dt>
                  <dd className="font-medium">{project.channel_origin}</dd>
                </div>
                {project.store_id && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Magasin</dt>
                    <dd className="font-medium">{project.store_id}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-500">Créé le</dt>
                  <dd className="text-xs">{formatDateShort(project.created_at)}</dd>
                </div>
              </dl>
            </div>

            {/* Orders summary */}
            {project.orders.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-700 text-sm mb-3">
                  Commandes ({project.orders.length})
                </h3>
                {project.orders.map((order, i) => (
                  <div
                    key={order.id}
                    className="border-b border-slate-100 last:border-0 pb-2 mb-2 last:mb-0 last:pb-0"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-slate-700">
                        Cmd {i + 1}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        {order.status}
                      </span>
                    </div>
                    {order.erp_order_ref && (
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        {order.erp_order_ref}
                      </p>
                    )}
                    {order.promised_delivery_date && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Livraison promise : {formatDateShort(order.promised_delivery_date)}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      {order.lines.length} ligne{order.lines.length > 1 ? "s" : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Consolidation */}
            {project.consolidation && (
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-700 text-sm mb-2">
                  Consolidation
                </h3>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Statut</dt>
                    <dd className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {project.consolidation.status}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Station</dt>
                    <dd className="font-medium text-xs">{project.consolidation.station_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Arrivées</dt>
                    <dd className="text-xs">
                      {project.consolidation.orders_arrived.length}/
                      {project.consolidation.orders_required.length}
                    </dd>
                  </div>
                  {project.consolidation.estimated_complete_date && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">ETA complet</dt>
                      <dd className="text-xs">
                        {formatDateShort(project.consolidation.estimated_complete_date)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Last mile */}
            {project.last_mile && (
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-700 text-sm mb-2">Last Mile</h3>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Statut</dt>
                    <dd className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {project.last_mile.status}
                    </dd>
                  </div>
                  {project.last_mile.scheduled_date && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Planifié</dt>
                      <dd className="text-xs">
                        {formatDateShort(project.last_mile.scheduled_date)}
                      </dd>
                    </div>
                  )}
                  {project.last_mile.delivered_at && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Livré</dt>
                      <dd className="text-xs text-green-600">
                        {formatDate(project.last_mile.delivered_at)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Lien de suivi client */}
            {project.tracking_token && (
              <TrackingTokenBlock token={project.tracking_token} />
            )}

            {/* Analyse IA des risques */}
            <RiskPanel projectId={project.id} />

            {/* Active anomalies */}
            {project.notifications.length > 0 && (
              <div className="bg-white rounded-lg border border-red-200 p-4">
                <h3 className="font-semibold text-red-700 text-sm mb-3">
                  Anomalies actives ({project.notifications.length})
                </h3>
                <div className="space-y-2">
                  {project.notifications.slice(0, 5).map((n) => (
                    <div key={n.id} className="text-xs">
                      <div className="flex items-center gap-1.5">
                        {n.rule && (
                          <SeverityBadge severity={n.rule.severity} size="sm" />
                        )}
                        <span className="font-medium text-slate-700">
                          {n.rule?.name ?? "Règle inconnue"}
                        </span>
                      </div>
                      <p className="text-slate-400 mt-0.5 pl-1">
                        {formatDate(n.sent_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes opérateur */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <StickyNote className="h-4 w-4 text-slate-400" />
                  Notes ({project.notes.length})
                </h3>
                {!isAddingNote && (
                  <button
                    onClick={() => setIsAddingNote(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Ajouter
                  </button>
                )}
              </div>

              {isAddingNote && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!noteText.trim()) return;
                    void addNote
                      .mutateAsync({
                        projectId: project.id,
                        content: noteText.trim(),
                        author_name: authData?.user?.name ?? "Opérateur",
                      })
                      .then(() => {
                        setNoteText("");
                        setIsAddingNote(false);
                      });
                  }}
                  className="mb-3"
                >
                  <textarea
                    autoFocus
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={3}
                    placeholder="Ajouter une note…"
                    className="w-full text-sm border border-slate-200 rounded px-3 py-2 resize-none focus:outline-none focus:border-blue-400 mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={addNote.isPending || !noteText.trim()}
                      className="text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                    >
                      {addNote.isPending ? "Ajout…" : "Ajouter"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsAddingNote(false); setNoteText(""); }}
                      className="text-xs text-slate-500 border border-slate-200 rounded px-3 py-1.5 hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                {project.notes.length === 0 && !isAddingNote && (
                  <p className="text-xs text-slate-400 italic">Aucune note</p>
                )}
                {project.notes.map((note) => (
                  <div key={note.id} className="border-l-2 border-slate-200 pl-3 py-1">
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{note.content}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {note.author_name} · {formatDate(note.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Main — timeline or gantt */}
          <div className="flex-1 min-w-0">
            {/* Tab switcher */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  onClick={() => setView("timeline")}
                  className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
                    view === "timeline"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Timeline
                </button>
                <button
                  onClick={() => setView("gantt")}
                  className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
                    view === "gantt"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Diagramme
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Mis à jour {formatDate(project.updated_at)}
              </p>
            </div>

            {view === "timeline" ? (
              <ProjectTimeline
                projectId={project.id}
                groups={buildGroups(project)}
              />
            ) : (
              <ProjectGantt project={project} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
