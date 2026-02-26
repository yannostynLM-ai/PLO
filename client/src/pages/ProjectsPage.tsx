import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects, useCreateProject, downloadCsv } from "../lib/api.ts";
import type { ProjectFilters } from "../lib/api.ts";
import SeverityBadge from "../components/SeverityBadge.tsx";
import {
  formatDate,
  projectStatusLabel,
  projectTypeLabel,
} from "../lib/utils.ts";
import { RefreshCw, X, Download, Plus } from "lucide-react";

// =============================================================================
// ProjectFormModal — création de projet
// =============================================================================

interface ProjectFormModalProps {
  onClose: () => void;
}

function ProjectFormModal({ onClose }: ProjectFormModalProps) {
  const navigate = useNavigate();
  const createProject = useCreateProject();

  const [customerId,    setCustomerId]    = useState("");
  const [projectType,   setProjectType]   = useState("kitchen");
  const [channelOrigin, setChannelOrigin] = useState("store");
  const [storeId,       setStoreId]       = useState("");
  const [status,        setStatus]        = useState("draft");
  const [error,         setError]         = useState<string | null>(null);
  const [success,       setSuccess]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await createProject.mutateAsync({
        customer_id:    customerId,
        project_type:   projectType,
        channel_origin: channelOrigin,
        store_id:       storeId || undefined,
        status,
      });
      setSuccess(true);
      setTimeout(() => {
        void navigate(`/projects/${result.project.id}`);
      }, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  const inputCls = "w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Nouveau projet</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} className="px-6 py-5 space-y-4">
          {/* Customer ID */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ID Client (CRM)</label>
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
              placeholder="Ex: CLIENT-2024-00123"
              className={inputCls}
            />
          </div>

          {/* Type + Channel row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Type de projet</label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                className={inputCls}
              >
                <option value="kitchen">Cuisine</option>
                <option value="bathroom">Salle de bain</option>
                <option value="energy_renovation">Rénovation énergétique</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Canal d'origine</label>
              <select
                value={channelOrigin}
                onChange={(e) => setChannelOrigin(e.target.value)}
                className={inputCls}
              >
                <option value="store">Magasin</option>
                <option value="web">Web</option>
                <option value="mixed">Mixte</option>
              </select>
            </div>
          </div>

          {/* Store ID */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Magasin référent <span className="font-normal text-slate-400">(optionnel)</span>
            </label>
            <input
              type="text"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              placeholder="Ex: STORE-75001"
              className={inputCls}
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Statut initial</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputCls}
            >
              <option value="draft">Brouillon</option>
              <option value="active">Actif</option>
              <option value="on_hold">En attente</option>
            </select>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              Projet créé — redirection…
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
              disabled={createProject.isPending || success}
              className="text-sm bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
            >
              {createProject.isPending ? "Création…" : "Créer le projet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// ProjectsPage
// =============================================================================

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ProjectFilters>({});
  const [rawQ, setRawQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Debounce 300ms sur la recherche texte
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) => {
        const next = { ...prev };
        if (rawQ) next.q = rawQ;
        else delete next.q;
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [rawQ]);

  const { data, isLoading, error, refetch, isFetching } = useProjects(filters);
  const projects = data?.projects ?? [];

  const hasFilters = rawQ !== "" || Object.keys(filters).length > 0;

  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (filters.q)        params.set("q",        filters.q);
      if (filters.status)   params.set("status",   filters.status);
      if (filters.severity) params.set("severity", filters.severity);
      if (filters.type)     params.set("type",     filters.type);
      if (filters.store)    params.set("store",    filters.store);
      const qs = params.toString() ? `?${params.toString()}` : "";
      await downloadCsv(
        `/api/projects/export.csv${qs}`,
        `projets-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  const resetFilters = () => {
    setFilters({});
    setRawQ("");
  };

  const setSeverity = (s: string | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (s) next.severity = s;
      else delete next.severity;
      return next;
    });
  };

  const setStatus = (s: string | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (s) next.status = s;
      else delete next.status;
      return next;
    });
  };

  const setType = (t: string | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (t) next.type = t;
      else delete next.type;
      return next;
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Projets</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {projects.length} projet{projects.length > 1 ? "s" : ""} trouvé{projects.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 border border-slate-200 rounded px-2.5 py-1.5 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Réinitialiser
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-sm bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nouveau projet
          </button>
          <button
            onClick={() => void handleExport()}
            disabled={isExporting}
            className="flex items-center gap-1.5 text-sm border border-slate-200 rounded px-3 py-1.5 text-slate-500 hover:text-green-600 transition-colors"
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
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        {/* Recherche client */}
        <input
          type="text"
          value={rawQ}
          onChange={(e) => setRawQ(e.target.value)}
          placeholder="Rechercher un client…"
          className="text-sm border border-slate-200 rounded px-3 py-1.5 w-48 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />

        {/* Type de projet */}
        <select
          value={filters.type ?? ""}
          onChange={(e) => setType(e.target.value || undefined)}
          className="text-sm border border-slate-200 rounded px-3 py-1.5 text-slate-600 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        >
          <option value="">Tous types</option>
          <option value="kitchen">Cuisine</option>
          <option value="bathroom">Salle de bain</option>
          <option value="renovation">Rénovation</option>
          <option value="other">Autre</option>
        </select>

        {/* Sévérité */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Sévérité :</span>
          {(["all", "critical", "warning", "ok"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(s === "all" ? undefined : s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                (s === "all" ? !filters.severity : filters.severity === s)
                  ? "bg-slate-800 text-white border-slate-800"
                  : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              {s === "all" ? "Tous" : s === "critical" ? "Critique" : s === "warning" ? "Warning" : "OK"}
            </button>
          ))}
        </div>

        {/* Statut */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Statut :</span>
          {(["all", "active", "completed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s === "all" ? undefined : s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                (s === "all" ? !filters.status : filters.status === s)
                  ? "bg-slate-800 text-white border-slate-800"
                  : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              {s === "all" ? "Tous" : s === "active" ? "Actifs" : "Terminés"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Chargement...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
          Erreur : {error.message}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Aucun projet trouvé</div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Sévérité</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Anomalies</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Dernier événement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((project) => (
                <tr
                  key={project.project_id}
                  onClick={() => void navigate(`/projects/${project.project_id}`)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">
                      {project.customer_id}
                    </span>
                    {project.store_id && (
                      <span className="text-xs text-slate-400 ml-2">
                        [{project.store_id}]
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {projectTypeLabel(project.project_type)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {projectStatusLabel(project.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={project.anomaly_severity} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {project.active_anomaly_count > 0 ? (
                      <span className="font-semibold text-red-600">
                        {project.active_anomaly_count}
                      </span>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {formatDate(project.last_event_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal création */}
      {showCreate && <ProjectFormModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
