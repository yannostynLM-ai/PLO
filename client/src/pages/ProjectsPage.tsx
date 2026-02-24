import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "../lib/api.ts";
import type { Severity } from "../lib/api.ts";
import SeverityBadge from "../components/SeverityBadge.tsx";
import {
  formatDate,
  projectStatusLabel,
  projectTypeLabel,
} from "../lib/utils.ts";
import { RefreshCw } from "lucide-react";

type SeverityFilter = "all" | Severity;
type StatusFilter = "all" | "active" | "completed";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useProjects();
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const projects = data?.projects ?? [];

  const filtered = projects.filter((p) => {
    if (severityFilter !== "all" && p.anomaly_severity !== severityFilter) return false;
    if (statusFilter === "active" && (p.status === "completed" || p.status === "cancelled")) return false;
    if (statusFilter === "completed" && p.status !== "completed") return false;
    return true;
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Projets</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {projects.length} projet{projects.length > 1 ? "s" : ""} au total
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
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Sévérité :</span>
          {(["all", "critical", "warning", "ok"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                severityFilter === s
                  ? "bg-slate-800 text-white border-slate-800"
                  : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              {s === "all" ? "Tous" : s === "critical" ? "Critique" : s === "warning" ? "Warning" : "OK"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Statut :</span>
          {(["all", "active", "completed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                statusFilter === s
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
      ) : filtered.length === 0 ? (
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
              {filtered.map((project) => (
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
    </div>
  );
}
