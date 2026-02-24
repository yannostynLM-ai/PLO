import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// =============================================================================
// Types API
// =============================================================================

export type Severity = "ok" | "warning" | "critical";
export type AnomalySeverity = "warning" | "critical";

export interface ProjectSummary {
  project_id: string;
  customer_id: string;
  project_type: string;
  status: string;
  channel_origin: string;
  store_id: string | null;
  created_at: string;
  updated_at: string;
  anomaly_severity: Severity;
  active_anomaly_count: number;
  oldest_unack_anomaly_at: string | null;
  last_event_at: string | null;
}

export interface StepDetail {
  id: string;
  step_type: string;
  status: string;
  expected_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  events: EventDetail[];
}

export interface EventDetail {
  id: string;
  event_type: string;
  source: string;
  severity: string;
  payload: unknown;
  created_at: string;
  acknowledged_by: string | null;
}

export interface OrderDetail {
  id: string;
  erp_order_ref: string | null;
  status: string;
  delivery_address: unknown;
  promised_delivery_date: string | null;
  lines: { id: string; sku: string; label: string; quantity: number; stock_status: string }[];
  shipments: { id: string; carrier: string | null; status: string; estimated_arrival: string | null }[];
  steps: StepDetail[];
  events: EventDetail[];
}

export interface ProjectDetail {
  id: string;
  customer_id: string;
  project_type: string;
  status: string;
  channel_origin: string;
  store_id: string | null;
  created_at: string;
  updated_at: string;
  orders: OrderDetail[];
  consolidation: {
    id: string;
    status: string;
    station_name: string;
    estimated_complete_date: string | null;
    orders_required: string[];
    orders_arrived: string[];
  } | null;
  last_mile: {
    id: string;
    status: string;
    scheduled_date: string | null;
    delivered_at: string | null;
  } | null;
  installation: {
    id: string;
    status: string;
    scheduled_date: string | null;
    technician_name: string | null;
    steps: StepDetail[];
  } | null;
  steps: StepDetail[];
  events: EventDetail[];
  notifications: AnomalyNotification[];
}

export interface AnomalyNotification {
  id: string;
  project_id: string;
  channel: string;
  recipient: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  rule: { id: string; name: string; severity: AnomalySeverity; scope: string } | null;
  project: { id: string; customer_id: string; project_type: string; status: string } | null;
  event: { id: string; event_type: string; acknowledged_by: string | null; created_at: string } | null;
}

export interface AnomalyRule {
  id: string;
  name: string;
  scope: string;
  step_type: string;
  severity: AnomalySeverity;
  active: boolean;
  condition: unknown;
  action: unknown;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Fetch helpers
// =============================================================================

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const MANUAL_KEY = "secret-manual-key";

export function apiIngest(body: Record<string, unknown>) {
  return apiFetch("/api/events/ingest", {
    method: "POST",
    headers: { Authorization: `Bearer ${MANUAL_KEY}` },
    body: JSON.stringify(body),
  });
}

// =============================================================================
// React Query hooks
// =============================================================================

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<{ projects: ProjectSummary[] }>("/api/projects"),
    refetchInterval: 30_000,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => apiFetch<{ project: ProjectDetail }>(`/api/projects/${id}`),
    refetchInterval: 60_000,
  });
}

export function useAnomalies(filters?: { severity?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.severity) params.set("severity", filters.severity);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString() ? `?${params}` : "";

  return useQuery({
    queryKey: ["anomalies", filters],
    queryFn: () => apiFetch<{ anomalies: AnomalyNotification[] }>(`/api/anomalies${qs}`),
    refetchInterval: 30_000,
  });
}

export function useRules() {
  return useQuery({
    queryKey: ["rules"],
    queryFn: () => apiFetch<{ rules: AnomalyRule[] }>("/api/rules"),
  });
}

export function useAcknowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, acknowledged_by, comment }: { id: string; acknowledged_by: string; comment?: string }) =>
      apiFetch(`/api/anomalies/${id}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({ acknowledged_by, comment }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["anomalies"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["project"] });
    },
  });
}

export function useToggleRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<{ rule: AnomalyRule }>(`/api/rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: ["rules"] });
      const prev = qc.getQueryData<{ rules: AnomalyRule[] }>(["rules"]);
      qc.setQueryData<{ rules: AnomalyRule[] }>(["rules"], (old) =>
        old
          ? { rules: old.rules.map((r) => (r.id === id ? { ...r, active } : r)) }
          : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["rules"], ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["rules"] });
    },
  });
}
