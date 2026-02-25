import { useParams, useNavigate } from "react-router-dom";
import { useProject } from "../lib/api.ts";
import type { StepDetail, OrderDetail } from "../lib/api.ts";
import ProjectTimeline from "../components/ProjectTimeline.tsx";
import SeverityBadge from "../components/SeverityBadge.tsx";
import {
  formatDate,
  formatDateShort,
  projectStatusLabel,
  projectTypeLabel,
} from "../lib/utils.ts";
import { ArrowLeft, RefreshCw, Copy, Check } from "lucide-react";
import { useState } from "react";

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

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useProject(id!);

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
                <div className="flex justify-between">
                  <dt className="text-slate-500">Statut</dt>
                  <dd>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {projectStatusLabel(project.status)}
                    </span>
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
          </aside>

          {/* Main — timeline */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">Timeline du projet</h2>
              <p className="text-xs text-slate-400">
                Mis à jour {formatDate(project.updated_at)}
              </p>
            </div>
            <ProjectTimeline
              projectId={project.id}
              groups={buildGroups(project)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
