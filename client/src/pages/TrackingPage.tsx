import { useParams } from "react-router-dom";
import { useTracking } from "../lib/api.ts";
import type { TrackingMilestone } from "../lib/api.ts";
import { formatDate } from "../lib/utils.ts";
import { Activity, CheckCircle2, Circle, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";

// =============================================================================
// TrackingPage — Portail de suivi client public (Sprint 7)
// Accès via /suivi/:token — page standalone, mobile-first
// =============================================================================

function MilestoneIcon({ status }: { status: "completed" | "in_progress" | "pending" }) {
  if (status === "completed")
    return <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />;
  if (status === "in_progress")
    return <Loader2 className="h-6 w-6 text-blue-500 flex-shrink-0 animate-spin" />;
  return <Circle className="h-6 w-6 text-slate-300 flex-shrink-0" />;
}

function MilestoneConnector({ status }: { status: "completed" | "in_progress" | "pending" }) {
  return (
    <div
      className={`w-0.5 h-6 mx-auto ${
        status === "completed" ? "bg-green-300" : "bg-slate-200"
      }`}
    />
  );
}

function ShipmentStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-slate-100 text-slate-600",
    dispatched: "bg-blue-100 text-blue-700",
    in_transit: "bg-blue-100 text-blue-700",
    arrived: "bg-green-100 text-green-700",
    exception: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    pending: "En attente",
    dispatched: "Expédié",
    in_transit: "En transit",
    arrived: "Arrivé",
    exception: "Incident",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? "bg-slate-100 text-slate-600"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function ProjectStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    on_hold: "bg-orange-100 text-orange-700",
    cancelled: "bg-red-100 text-red-700",
    draft: "bg-slate-100 text-slate-600",
  };
  const labels: Record<string, string> = {
    active: "En cours",
    completed: "Terminé",
    on_hold: "En attente",
    cancelled: "Annulé",
    draft: "Brouillon",
  };
  return (
    <span className={`text-sm font-medium px-3 py-1 rounded-full ${map[status] ?? "bg-slate-100 text-slate-600"}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Horizontal stepper
// ---------------------------------------------------------------------------

function HorizontalStepper({ milestones }: { milestones: TrackingMilestone[] }) {
  const completedCount = milestones.filter((m) => m.status === "completed").length;
  const totalCount = milestones.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      {/* Dots + connectors */}
      <div className="flex items-center">
        {milestones.map((m, idx) => (
          <div key={m.key} className="flex items-center flex-1 last:flex-none">
            {/* Dot */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className={`w-3 h-3 rounded-full border-2 transition-colors ${
                  m.status === "completed"
                    ? "bg-green-500 border-green-500"
                    : m.status === "in_progress"
                    ? "bg-blue-500 border-blue-500 animate-pulse"
                    : "bg-white border-slate-300"
                }`}
                title={m.label}
              />
              <span className="hidden sm:block text-[10px] text-slate-500 text-center max-w-[48px] leading-tight truncate">
                {m.label}
              </span>
            </div>
            {/* Connector */}
            {idx < milestones.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 ${
                  m.status === "completed" ? "bg-green-400" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Global progress bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>{completedCount}/{totalCount} étapes complétées</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-400 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TrackingPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error, refetch, dataUpdatedAt } = useTracking(token ?? "");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    if (dataUpdatedAt) {
      const updateTime = () => {
        const secs = Math.round((Date.now() - dataUpdatedAt) / 1000);
        if (secs < 60) setLastUpdated(`il y a ${secs}s`);
        else setLastUpdated(`il y a ${Math.round(secs / 60)}min`);
      };
      updateTime();
      const interval = setInterval(updateTime, 5000);
      return () => clearInterval(interval);
    }
  }, [dataUpdatedAt]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          <span className="font-bold text-slate-900 text-sm">PLO</span>
          <span className="text-slate-400 text-sm">·</span>
          <span className="text-slate-600 text-sm">Suivi de votre projet</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Chargement…
          </div>
        )}

        {/* Error / 404 */}
        {error && (
          <div className="bg-white rounded-xl border border-red-100 p-8 text-center shadow-sm">
            <p className="text-4xl mb-4">🔗</p>
            <p className="font-semibold text-slate-800">Lien invalide</p>
            <p className="text-sm text-slate-500 mt-1">
              Ce lien de suivi n'est plus valide ou a expiré.
            </p>
          </div>
        )}

        {data && (
          <>
            {/* Stepper horizontal */}
            {data.milestones.length > 0 && (
              <HorizontalStepper milestones={data.milestones} />
            )}

            {/* Project header card */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-slate-900">{data.project_type_label}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{data.project_ref}</p>
                </div>
                <ProjectStatusBadge status={data.status} />
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Dossier ouvert le {formatDate(data.created_at)}
              </p>
            </div>

            {/* Milestones */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Avancement du projet
                </p>
              </div>
              <div className="px-4 py-3">
                {data.milestones.map((milestone, idx) => (
                  <div key={milestone.key}>
                    <div className="flex items-center gap-3 py-2">
                      <MilestoneIcon status={milestone.status} />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            milestone.status === "completed"
                              ? "text-slate-700"
                              : milestone.status === "in_progress"
                              ? "text-blue-700"
                              : "text-slate-400"
                          }`}
                        >
                          {milestone.label}
                        </p>
                        {milestone.date && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {milestone.status === "completed" ? "✓ " : "~"}{formatDate(milestone.date)}
                          </p>
                        )}
                        {!milestone.date && milestone.status === "pending" && (
                          <p className="text-xs text-slate-300 mt-0.5">Date à confirmer</p>
                        )}
                        {!milestone.date && milestone.status === "in_progress" && (
                          <p className="text-xs text-blue-400 mt-0.5">En cours…</p>
                        )}
                      </div>
                      {milestone.status === "in_progress" && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                          En cours
                        </span>
                      )}
                    </div>
                    {idx < data.milestones.length - 1 && (
                      <div className="ml-3">
                        <MilestoneConnector status={milestone.status} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Commandes et expéditions */}
            {data.orders.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Commandes ({data.orders.length})
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {data.orders.map((order, idx) => (
                    <div key={idx} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-800">
                          {order.ref ?? `Commande ${idx + 1}`}
                        </p>
                        <span className="text-xs text-slate-500">{order.lines_count} article(s)</span>
                      </div>
                      {order.promised_delivery_date && (
                        <p className="text-xs text-slate-500 mb-2">
                          Livraison prévue : {formatDate(order.promised_delivery_date)}
                        </p>
                      )}
                      {order.shipments.length > 0 && (
                        <div className="space-y-2 mt-2">
                          {order.shipments.map((shipment, si) => (
                            <div
                              key={si}
                              className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {shipment.carrier && (
                                  <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded flex-shrink-0">
                                    {shipment.carrier}
                                  </span>
                                )}
                                {shipment.carrier_tracking_ref ? (
                                  <span className="text-xs text-slate-500 truncate">
                                    {shipment.carrier_tracking_ref}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-300">Référence non disponible</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <ShipmentStatusBadge status={shipment.status} />
                                {shipment.carrier_tracking_ref && shipment.carrier && (
                                  <a
                                    href={`https://www.google.com/search?q=${encodeURIComponent(shipment.carrier)}+${encodeURIComponent(shipment.carrier_tracking_ref)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:text-blue-700"
                                    title="Suivre le colis"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Livraison */}
            {data.last_mile && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Livraison à domicile
                  </p>
                </div>
                <div className="px-4 py-3 space-y-1.5">
                  {data.last_mile.delivered_at ? (
                    <p className="text-sm text-green-700 font-medium">
                      ✓ Livré le {formatDate(data.last_mile.delivered_at)}
                      {data.last_mile.is_partial && (
                        <span className="ml-2 text-xs text-orange-600">(livraison partielle)</span>
                      )}
                    </p>
                  ) : data.last_mile.scheduled_date ? (
                    <>
                      <p className="text-sm text-slate-700">
                        Planifiée le {formatDate(data.last_mile.scheduled_date)}
                      </p>
                      {data.last_mile.scheduled_slot && (
                        <p className="text-xs text-slate-500">
                          Créneau : {data.last_mile.scheduled_slot}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Date de livraison à confirmer</p>
                  )}
                </div>
              </div>
            )}

            {/* Installation */}
            {data.installation && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Installation / Pose
                  </p>
                </div>
                <div className="px-4 py-3 space-y-1.5">
                  {data.installation.completed_at ? (
                    <p className="text-sm text-green-700 font-medium">
                      ✓ Posé le {formatDate(data.installation.completed_at)}
                    </p>
                  ) : data.installation.scheduled_date ? (
                    <>
                      <p className="text-sm text-slate-700">
                        Planifiée le {formatDate(data.installation.scheduled_date)}
                      </p>
                      {data.installation.scheduled_slot && (
                        <p className="text-xs text-slate-500">
                          Créneau : {data.installation.scheduled_slot}
                        </p>
                      )}
                      {data.installation.technician_name && (
                        <p className="text-xs text-slate-500">
                          Technicien : {data.installation.technician_name}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Date d'installation à confirmer</p>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-slate-400 pb-4">
              <span>Actualisé {lastUpdated || "maintenant"}</span>
              <button
                onClick={() => void refetch()}
                className="flex items-center gap-1 text-blue-500 hover:text-blue-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Actualiser
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
