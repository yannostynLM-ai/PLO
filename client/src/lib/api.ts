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
  tracking_token: string | null;
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

export interface TrackingMilestone {
  key: string;
  label: string;
  status: "completed" | "in_progress" | "pending";
  date: string | null;
}

export interface TrackingData {
  project_ref: string;
  project_type_label: string;
  status: string;
  created_at: string;
  milestones: TrackingMilestone[];
  orders: Array<{
    ref: string | null;
    status: string;
    promised_delivery_date: string | null;
    promised_installation_date: string | null;
    lines_count: number;
    shipments: Array<{
      carrier: string | null;
      carrier_tracking_ref: string | null;
      status: string;
      estimated_arrival: string | null;
      actual_arrival: string | null;
    }>;
  }>;
  consolidation: {
    status: string;
    orders_arrived: number;
    orders_required: number;
    estimated_complete_date: string | null;
  } | null;
  last_mile: {
    status: string;
    scheduled_date: string | null;
    scheduled_slot: string | null;
    delivered_at: string | null;
    is_partial: boolean;
  } | null;
  installation: {
    status: string;
    scheduled_date: string | null;
    scheduled_slot: string | null;
    technician_name: string | null;
    completed_at: string | null;
  } | null;
}

export interface Stats {
  period_days: number;
  total_notifications: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
  acknowledged_count: number;
  acknowledgement_rate: number;
  mean_time_to_acknowledge_hours: number | null;
  escalated_count: number;
  crm_tickets_created: number;
  top_rules: Array<{ rule_id: string; rule_name: string; count: number; severity: string }>;
  active_projects_with_anomalies: number;
  trend_current_7d: number;
  trend_previous_7d: number;
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

export function useTracking(token: string) {
  return useQuery<TrackingData>({
    queryKey: ["tracking", token],
    queryFn: () => apiFetch<TrackingData>(`/api/public/tracking/${token}`),
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => apiFetch<Stats>("/api/stats"),
    refetchInterval: 60_000,
  });
}

export interface RiskFactor {
  factor: string;
  impact: "low" | "medium" | "high";
  detail: string;
}

export interface RiskAnalysis {
  risk_score: number;
  level: "low" | "medium" | "high" | "critical";
  summary: string;
  factors: RiskFactor[];
  recommendation: string;
  generated_at: string;
  cached: boolean;
}

export function useRiskAnalysis(projectId: string, enabled: boolean) {
  const qc = useQueryClient();
  const query = useQuery<RiskAnalysis>({
    queryKey: ["risk", projectId],
    queryFn: () => apiFetch<RiskAnalysis>(`/api/projects/${projectId}/risk-analysis`),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["risk", projectId] });
  return { ...query, refresh };
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
