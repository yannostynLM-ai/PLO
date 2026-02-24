import { useState } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiIngest } from "../lib/api.ts";

const SUGGESTED_TYPES = [
  "stock.check_ok",
  "stock.shortage",
  "picking.started",
  "picking.completed",
  "shipment.dispatched",
  "shipment.arrived_at_station",
  "consolidation.complete",
  "lastmile.scheduled",
  "lastmile.delivered",
  "installation.scheduled",
  "installation.completed",
  "project.closed",
];

interface Props {
  projectId: string;
  stepType?: string;
  onClose: () => void;
}

export default function ManualEventModal({ projectId, stepType, onClose }: Props) {
  const qc = useQueryClient();
  const [eventType, setEventType] = useState(stepType ? "" : "");
  const [payload, setPayload] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const sourceRef = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let parsedPayload: Record<string, unknown>;
    try {
      parsedPayload = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      setError("Le payload JSON est invalide");
      return;
    }

    setLoading(true);
    try {
      await apiIngest({
        source_ref: sourceRef,
        event_type: eventType,
        project_ref: projectId,
        occurred_at: new Date().toISOString(),
        payload: parsedPayload,
      });
      setSuccess(true);
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-slate-800">Saisie manuelle d'événement</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} className="px-5 py-4 space-y-4">
          {/* Projet */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Projet (project_ref)
            </label>
            <input
              readOnly
              value={projectId}
              className="w-full border rounded px-3 py-2 text-sm bg-slate-50 text-slate-500"
            />
          </div>

          {/* Event type */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Type d'événement *
            </label>
            <input
              list="event-types"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="ex: stock.check_ok"
              required
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <datalist id="event-types">
              {SUGGESTED_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          {/* Source ref */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Source ref (auto-généré)
            </label>
            <input
              readOnly
              value={sourceRef}
              className="w-full border rounded px-3 py-2 text-sm bg-slate-50 text-slate-400 font-mono text-xs"
            />
          </div>

          {/* Payload */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Payload JSON
            </label>
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={4}
              className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">
              Événement enregistré avec succès
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Envoi..." : "Envoyer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
