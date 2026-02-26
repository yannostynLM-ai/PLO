import { useNavigate, useParams } from "react-router-dom";
import { useCustomer } from "../lib/api.ts";
import SeverityBadge from "../components/SeverityBadge.tsx";
import { formatDate, projectStatusLabel, projectTypeLabel } from "../lib/utils.ts";
import { ArrowLeft, RefreshCw } from "lucide-react";

export default function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useCustomer(customerId ?? "");

  if (isLoading) {
    return <div className="p-6 text-center py-12 text-slate-400">Chargement...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">
          {error.message === "Not Found" || error.message.includes("404")
            ? "Client introuvable."
            : `Erreur : ${error.message}`}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { customer_id, projects, stats } = data;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => void navigate(-1)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 mb-2 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour clients
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">{customer_id}</h1>
            <SeverityBadge severity={stats.anomaly_severity} size="sm" />
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-slate-500">
            <span>
              <span className="font-medium text-slate-700">{stats.project_count}</span> projet{stats.project_count > 1 ? "s" : ""}
            </span>
            <span>
              <span className="font-medium text-slate-700">{stats.active_project_count}</span> actif{stats.active_project_count > 1 ? "s" : ""}
            </span>
            {stats.active_anomaly_count > 0 && (
              <span className="text-red-600 font-medium">
                {stats.active_anomaly_count} anomalie{stats.active_anomaly_count > 1 ? "s" : ""} actives
              </span>
            )}
          </div>
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

      {/* Projects table */}
      {projects.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Aucun projet pour ce client</div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Magasin</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Sévérité</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Anomalies</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Dernier événement</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Créé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((project) => (
                <tr
                  key={project.project_id}
                  onClick={() => void navigate(`/projects/${project.project_id}`)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-slate-700">
                    {projectTypeLabel(project.project_type)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {projectStatusLabel(project.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {project.store_id ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={project.anomaly_severity} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {project.active_anomaly_count > 0 ? (
                      <span className="font-semibold text-red-600">{project.active_anomaly_count}</span>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {formatDate(project.last_event_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {formatDate(project.created_at)}
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
