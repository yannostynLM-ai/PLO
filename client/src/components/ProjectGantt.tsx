// =============================================================================
// ProjectGantt — Diagramme Gantt pur CSS (Sprint 8)
// =============================================================================

import type { ProjectDetail, StepDetail } from "../lib/api.ts";

interface Props {
  project: ProjectDetail;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

function fmtTick(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function stepColor(status: string): string {
  if (status === "completed") return "bg-green-400";
  if (status === "in_progress") return "bg-blue-400";
  if (status === "pending" || status === "scheduled") return "bg-slate-300";
  return "bg-slate-200";
}

// ---------------------------------------------------------------------------
// Gantt row segment
// ---------------------------------------------------------------------------

interface Segment {
  leftPct: number;
  widthPct: number;
  color: string;
  title: string;
}

function GanttBar({ label, segments, markers }: {
  label: string;
  segments: Segment[];
  markers: { pct: number; color: string; title: string; dashed?: boolean }[];
}) {
  return (
    <div className="flex items-center gap-2 h-10">
      {/* Label */}
      <div className="w-28 flex-shrink-0 text-xs text-slate-600 text-right truncate pr-2" title={label}>
        {label}
      </div>

      {/* Bar track */}
      <div className="flex-1 h-6 relative bg-slate-100 rounded overflow-visible">
        {/* Segments */}
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`absolute top-0 h-full rounded ${seg.color} opacity-80 hover:opacity-100 transition-opacity`}
            style={{
              left: `${Math.max(0, seg.leftPct)}%`,
              width: `${Math.max(0.5, Math.min(seg.widthPct, 100 - Math.max(0, seg.leftPct)))}%`,
            }}
            title={seg.title}
          />
        ))}

        {/* Markers (today, promised_delivery_date) */}
        {markers.map((m, i) => (
          <div
            key={i}
            className={`absolute top-[-4px] bottom-[-4px] w-0.5 ${m.color} z-10`}
            style={{
              left: `${Math.max(0, Math.min(m.pct, 99))}%`,
              borderStyle: m.dashed ? "dashed" : "solid",
            }}
            title={m.title}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Gantt component
// ---------------------------------------------------------------------------

export default function ProjectGantt({ project }: Props) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // --- Compute date range ---
  const allDates: Date[] = [new Date(project.created_at), today];

  for (const order of project.orders) {
    if (order.promised_delivery_date) allDates.push(new Date(order.promised_delivery_date));
    for (const s of order.shipments) {
      if (s.estimated_arrival) allDates.push(new Date(s.estimated_arrival));
    }
    for (const step of order.steps) {
      if (step.expected_at) allDates.push(new Date(step.expected_at));
      if (step.completed_at) allDates.push(new Date(step.completed_at));
    }
  }
  for (const step of project.steps) {
    if (step.expected_at) allDates.push(new Date(step.expected_at));
    if (step.completed_at) allDates.push(new Date(step.completed_at));
  }
  if (project.last_mile?.scheduled_date) allDates.push(new Date(project.last_mile.scheduled_date));
  if (project.last_mile?.delivered_at) allDates.push(new Date(project.last_mile.delivered_at));
  if (project.consolidation?.estimated_complete_date)
    allDates.push(new Date(project.consolidation.estimated_complete_date));
  if (project.installation?.scheduled_date)
    allDates.push(new Date(project.installation.scheduled_date));

  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
  // maxDate = max + 7 days buffer
  const maxRaw = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const maxDate = new Date(maxRaw.getTime() + 7 * 24 * 60 * 60 * 1000);

  const totalMs = maxDate.getTime() - minDate.getTime();

  function toPct(date: Date | string | null | undefined): number {
    const d = parseDate(typeof date === "string" ? date : date?.toISOString() ?? null);
    if (!d) return 0;
    return ((d.getTime() - minDate.getTime()) / totalMs) * 100;
  }

  // Convert step into a segment
  function stepToSegment(step: StepDetail): Segment | null {
    const start = parseDate(step.completed_at ?? step.expected_at);
    const end = parseDate(step.completed_at ?? step.expected_at);
    if (!start || !end) {
      // Use expected_at as both start/end if available
      const d = parseDate(step.expected_at);
      if (!d) return null;
      const left = toPct(step.expected_at);
      return {
        leftPct: left,
        widthPct: 1.5,
        color: stepColor(step.status),
        title: `${step.step_type} — ${step.status}${step.expected_at ? `\nAttendu: ${fmtTick(new Date(step.expected_at))}` : ""}`,
      };
    }

    const startDate = parseDate(step.expected_at ?? step.completed_at);
    const endDate = parseDate(step.completed_at ?? step.expected_at);
    if (!startDate || !endDate) return null;

    const left = toPct(startDate.toISOString());
    const right = toPct(endDate.toISOString());
    const width = Math.max(1.5, right - left);

    return {
      leftPct: left,
      widthPct: width,
      color: stepColor(step.status),
      title: `${step.step_type} — ${step.status}${step.expected_at ? `\nAttendu: ${fmtTick(new Date(step.expected_at))}` : ""}${step.completed_at ? `\nComplété: ${fmtTick(new Date(step.completed_at))}` : ""}`,
    };
  }

  // --- Today marker ---
  const todayPct = toPct(today.toISOString());
  const todayMarker = { pct: todayPct, color: "bg-blue-600", title: `Aujourd'hui (${fmtTick(today)})` };

  // --- Ticks for date axis ---
  const tickCount = 5;
  const ticks: Date[] = [];
  for (let i = 0; i <= tickCount; i++) {
    ticks.push(new Date(minDate.getTime() + (totalMs * i) / tickCount));
  }

  // --- Rows ---
  // Row 1: project steps
  const projectSteps = project.steps.filter((s) => !s.step_type.startsWith("__"));
  const projectSegments = projectSteps.map(stepToSegment).filter(Boolean) as Segment[];

  // Row 2+: orders
  const orderRows = project.orders.map((order, i) => {
    const label = `CMD ${i + 1}${order.erp_order_ref ? ` (${order.erp_order_ref.slice(0, 8)})` : ""}`;
    const stepSegs = order.steps.map(stepToSegment).filter(Boolean) as Segment[];
    const shipmentSegs: Segment[] = order.shipments.map((s) => {
      const left = toPct(order.promised_delivery_date ?? project.created_at);
      const right = s.estimated_arrival
        ? toPct(s.estimated_arrival)
        : toPct(order.promised_delivery_date ?? today.toISOString());
      const color =
        s.status === "arrived"
          ? "bg-green-300"
          : s.status === "in_transit" || s.status === "dispatched"
          ? "bg-blue-300"
          : "bg-slate-200";
      return {
        leftPct: left,
        widthPct: Math.max(1.5, right - left),
        color,
        title: `Expédition — ${s.status}${s.estimated_arrival ? `\nETA: ${fmtTick(new Date(s.estimated_arrival))}` : ""}`,
      };
    });

    const markers = [];
    if (order.promised_delivery_date) {
      markers.push({
        pct: toPct(order.promised_delivery_date),
        color: "bg-orange-400",
        title: `Livraison promise: ${fmtTick(new Date(order.promised_delivery_date))}`,
        dashed: true,
      });
    }

    return { label, segments: [...stepSegs, ...shipmentSegs], markers };
  });

  // Consolidation row
  const consolidationRow = project.consolidation
    ? (() => {
        const left = toPct(project.created_at);
        const right = project.consolidation.estimated_complete_date
          ? toPct(project.consolidation.estimated_complete_date)
          : todayPct;
        const color =
          project.consolidation.status === "complete"
            ? "bg-green-400"
            : project.consolidation.status === "in_progress"
            ? "bg-blue-400"
            : "bg-slate-300";
        return {
          label: "Consolidation",
          segments: [{ leftPct: left, widthPct: Math.max(1.5, right - left), color, title: `Consolidation — ${project.consolidation.status}` }],
          markers: [],
        };
      })()
    : null;

  // Last mile row
  const lastMileRow = project.last_mile
    ? (() => {
        const start = project.last_mile.scheduled_date ?? today.toISOString();
        const end = project.last_mile.delivered_at ?? project.last_mile.scheduled_date ?? today.toISOString();
        const left = toPct(start);
        const right = toPct(end);
        const color =
          project.last_mile.delivered_at
            ? "bg-green-400"
            : project.last_mile.status === "scheduled"
            ? "bg-blue-300"
            : "bg-slate-200";
        return {
          label: "Last Mile",
          segments: [{ leftPct: left, widthPct: Math.max(1.5, right - left), color, title: `Last Mile — ${project.last_mile.status}` }],
          markers: [],
        };
      })()
    : null;

  // Installation row
  const installationRow = project.installation
    ? (() => {
        const start = project.installation.scheduled_date ?? today.toISOString();
        const left = toPct(start);
        const color =
          project.installation.status === "completed"
            ? "bg-green-400"
            : project.installation.status === "in_progress"
            ? "bg-blue-400"
            : "bg-slate-300";
        return {
          label: "Installation",
          segments: [{ leftPct: left, widthPct: 2, color, title: `Installation — ${project.installation.status}` }],
          markers: [],
        };
      })()
    : null;

  const rows = [
    { label: "Projet", segments: projectSegments, markers: [todayMarker] },
    ...orderRows,
    ...(consolidationRow ? [consolidationRow] : []),
    ...(lastMileRow ? [lastMileRow] : []),
    ...(installationRow ? [installationRow] : []),
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 overflow-x-auto">
      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs text-slate-500 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-400 inline-block" />Complété</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-400 inline-block" />En cours</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-300 inline-block" />Planifié</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-300 inline-block" />Transit</span>
        <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-blue-600 inline-block" />Aujourd'hui</span>
        <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-orange-400 inline-block border-dashed" />Promesse</span>
      </div>

      {/* Rows */}
      <div className="min-w-[480px]">
        {rows.map((row, i) => (
          <GanttBar key={i} label={row.label} segments={row.segments} markers={[...row.markers, todayMarker]} />
        ))}

        {/* Date axis */}
        <div className="flex ml-28 mt-2 relative">
          <div className="flex-1 flex justify-between text-xs text-slate-400 pl-2">
            {ticks.map((tick, i) => (
              <span key={i} className={i === 0 ? "text-left" : i === ticks.length - 1 ? "text-right" : "text-center"}>
                {fmtTick(tick)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
