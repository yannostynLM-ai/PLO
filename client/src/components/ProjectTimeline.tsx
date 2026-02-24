import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  stepStatusColor,
  stepStatusIcon,
  stepStatusLabel,
  formatDate,
} from "../lib/utils.ts";
import type { StepDetail, EventDetail } from "../lib/api.ts";
import ManualEventModal from "./ManualEventModal.tsx";

interface TimelineGroup {
  label: string;
  steps: StepDetail[];
}

interface Props {
  projectId: string;
  groups: TimelineGroup[];
}

function EventRow({ event }: { event: EventDetail }) {
  const severityColor =
    event.severity === "critical"
      ? "text-red-600"
      : event.severity === "warning"
      ? "text-orange-500"
      : "text-slate-500";

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className={`text-xs font-mono mt-0.5 ${severityColor}`}>
        {event.severity.toUpperCase().slice(0, 4)}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-slate-700 font-mono">{event.event_type}</span>
        <span className="text-xs text-slate-400 ml-2">[{event.source}]</span>
        {event.acknowledged_by && (
          <span className="text-xs text-green-600 ml-2">✓ {event.acknowledged_by}</span>
        )}
      </div>
      <span className="text-xs text-slate-400 whitespace-nowrap">
        {formatDate(event.created_at)}
      </span>
    </div>
  );
}

function StepRow({
  step,
  projectId,
}: {
  step: StepDetail;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const hasEvents = step.events.length > 0;

  return (
    <>
      <div className="flex items-start gap-3 py-3">
        {/* Status icon */}
        <div
          className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${stepStatusColor(step.status)}`}
        >
          {stepStatusIcon(step.status)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-800 text-sm font-mono">
              {step.step_type}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded border ${stepStatusColor(step.status)}`}
            >
              {stepStatusLabel(step.status)}
            </span>
            {step.expected_at && (
              <span className="text-xs text-slate-400">
                prévu {formatDate(step.expected_at)}
              </span>
            )}
            {step.completed_at && (
              <span className="text-xs text-green-600">
                terminé {formatDate(step.completed_at)}
              </span>
            )}
          </div>

          {/* Events toggle */}
          {hasEvents && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-1"
            >
              {open ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {step.events.length} événement{step.events.length > 1 ? "s" : ""}
            </button>
          )}

          {open && (
            <div className="mt-2 bg-slate-50 rounded border border-slate-200 px-3 py-1">
              {step.events.map((ev) => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </div>
          )}
        </div>

        {/* Manual event button */}
        <button
          onClick={() => setShowModal(true)}
          className="flex-shrink-0 text-xs text-slate-400 hover:text-blue-600 border border-slate-200 hover:border-blue-300 rounded px-2 py-1 transition-colors"
        >
          + Saisie
        </button>
      </div>

      {showModal && (
        <ManualEventModal
          projectId={projectId}
          stepType={step.step_type}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

export default function ProjectTimeline({ projectId, groups }: Props) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label} className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 rounded-t-lg">
            <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
              {group.label}
            </h3>
          </div>
          <div className="px-4 divide-y divide-slate-100">
            {group.steps.length === 0 ? (
              <p className="text-sm text-slate-400 py-3 italic">Aucune étape</p>
            ) : (
              group.steps.map((step) => (
                <StepRow key={step.id} step={step} projectId={projectId} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
