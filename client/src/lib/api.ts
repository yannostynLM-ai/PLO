import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";

// =============================================================================
// Types API
// =============================================================================

export type Severity = "ok" | "warning" | "critical";
export type AnomalySeverity = "warning" | "critical";

// Sprint 19 — métadonnées de pagination
export interface Pagination {
  total: number;
  page:  number;
  limit: number;
  pages: number;
}

export interface ProjectSummary {
  project_id: string;
  customer_id: string;
  project_type: string;
  status: string;
  channel_origin: string;
  store_id: string | null;
  assigned_to: string | null;   // Sprint 18
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
  assigned_to: string | null;   // Sprint 18
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
  notes: ProjectNote[];
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

export interface ProjectNote {
  id: string;
  project_id: string;
  content: string;
  author_name: string;
  created_at: string;
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

export interface ProjectFilters {
  q?: string;
  status?: string;
  severity?: string;
  type?: string;
  store?: string;
  assignee?: string;   // Sprint 18
  page?:  number;      // Sprint 19
  limit?: number;      // Sprint 19
}

export function useProjects(filters?: ProjectFilters) {
  const params = new URLSearchParams();
  if (filters?.q)        params.set("q",        filters.q);
  if (filters?.status)   params.set("status",   filters.status);
  if (filters?.severity) params.set("severity", filters.severity);
  if (filters?.type)     params.set("type",     filters.type);
  if (filters?.store)    params.set("store",    filters.store);
  if (filters?.assignee) params.set("assignee", filters.assignee);
  if (filters?.page)     params.set("page",     String(filters.page));
  if (filters?.limit)    params.set("limit",    String(filters.limit));
  const qs = params.toString() ? `?${params.toString()}` : "";

  return useQuery({
    queryKey: ["projects", filters ?? {}],
    queryFn: () => apiFetch<{ projects: ProjectSummary[] } & Pagination>(`/api/projects${qs}`),
    refetchInterval: 30_000,
  });
}

export interface SseNotificationPayload {
  id: string;
  project_id: string;
  rule_name: string;
  severity: string;
  project_customer_id: string;
  project_type: string;
  sent_at: string;
}

export function useSSENotifications() {
  const [notifications, setNotifications] = useState<SseNotificationPayload[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const es = new EventSource("/api/sse/notifications");
    es.onmessage = (event) => {
      const payload = JSON.parse(event.data as string) as SseNotificationPayload;
      setNotifications((prev) => [payload, ...prev].slice(0, 50));
      setUnreadCount((prev) => prev + 1);
    };
    return () => es.close();
  }, []);

  const markAllRead = useCallback(() => setUnreadCount(0), []);

  return { notifications, unreadCount, markAllRead };
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => apiFetch<{ project: ProjectDetail }>(`/api/projects/${id}`),
    refetchInterval: 60_000,
  });
}

export interface AnomalyFilters {
  status?: string;
  severity?: string;
  from?: string;
  to?: string;
  customer_id?: string;
  rule_name?: string;
  page?:  number;   // Sprint 19
  limit?: number;   // Sprint 19
}

export function useAnomalies(filters?: AnomalyFilters) {
  const params = new URLSearchParams();
  if (filters?.status)      params.set("status",      filters.status);
  if (filters?.severity)    params.set("severity",    filters.severity);
  if (filters?.from)        params.set("from",        filters.from);
  if (filters?.to)          params.set("to",          filters.to);
  if (filters?.customer_id) params.set("customer_id", filters.customer_id);
  if (filters?.rule_name)   params.set("rule_name",   filters.rule_name);
  if (filters?.page)        params.set("page",        String(filters.page));
  if (filters?.limit)       params.set("limit",       String(filters.limit));
  const qs = params.toString() ? `?${params.toString()}` : "";

  return useQuery({
    queryKey: ["anomalies", filters ?? {}],
    queryFn: () => apiFetch<{ anomalies: AnomalyNotification[] } & Pagination>(`/api/anomalies${qs}`),
    refetchInterval: 30_000,
  });
}

export async function downloadCsv(path: string, filename: string): Promise<void> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

// =============================================================================
// Sprint 9 — Auth hooks
// =============================================================================

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function useCurrentUser() {
  return useQuery<{ user: AuthUser }>({
    queryKey: ["me"],
    queryFn: () => apiFetch<{ user: AuthUser }>("/api/auth/me"),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      apiFetch<{ user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ message: string }>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => qc.clear(),
  });
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

// =============================================================================
// Sprint 10 — Users hooks
// =============================================================================

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export function useUsers() {
  return useQuery<{ users: UserSummary[] }>({
    queryKey: ["users"],
    queryFn: () => apiFetch<{ users: UserSummary[] }>("/api/users"),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; name: string; password: string; role: string }) =>
      apiFetch<{ user: UserSummary }>("/api/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; role?: string }) =>
      apiFetch<{ user: UserSummary }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ message: string }>(`/api/users/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiFetch<{ message: string }>(`/api/users/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
  });
}

// =============================================================================
// Sprint 12 — Customers hooks
// =============================================================================

export interface CustomerSummary {
  customer_id: string;
  project_count: number;
  active_project_count: number;
  anomaly_severity: Severity;
  active_anomaly_count: number;
  last_event_at: string | null;
}

export interface CustomerDetail {
  customer_id: string;
  projects: ProjectSummary[];
  stats: {
    project_count: number;
    active_project_count: number;
    anomaly_severity: Severity;
    active_anomaly_count: number;
  };
}

export function useCustomers(q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return useQuery({
    queryKey: ["customers", q ?? ""],
    queryFn: () => apiFetch<{ customers: CustomerSummary[] }>(`/api/customers${qs}`),
    refetchInterval: 30_000,
  });
}

export function useCustomer(customerId: string) {
  return useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => apiFetch<CustomerDetail>(`/api/customers/${customerId}`),
    refetchInterval: 60_000,
  });
}

export function useBulkAcknowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, acknowledged_by, comment }: { ids: string[]; acknowledged_by: string; comment?: string }) =>
      apiFetch<{ acknowledged: number; ids: string[] }>("/api/anomalies/bulk-acknowledge", {
        method: "POST",
        body: JSON.stringify({ ids, acknowledged_by, comment }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["anomalies"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<AnomalyRule, "id" | "created_at" | "updated_at">) =>
      apiFetch<{ rule: AnomalyRule }>("/api/rules", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["rules"] }); },
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Omit<AnomalyRule, "id" | "created_at" | "updated_at">> & { id: string }) =>
      apiFetch<{ rule: AnomalyRule }>(`/api/rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["rules"] }); },
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["rules"] }); },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      customer_id: string;
      project_type: string;
      channel_origin?: string;
      store_id?: string;
      status?: string;
    }) =>
      apiFetch<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["projects"] }); },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: string; store_id?: string | null; assigned_to?: string | null }) =>
      apiFetch<{ project: { id: string; status: string; store_id: string | null; assigned_to: string | null } }>(
        `/api/projects/${id}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ["project", id] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useAddProjectNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, content, author_name }: { projectId: string; content: string; author_name: string }) =>
      apiFetch<{ note: ProjectNote }>(`/api/projects/${projectId}/notes`, {
        method: "POST",
        body: JSON.stringify({ content, author_name }),
      }),
    onSuccess: (_data, { projectId }) => {
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
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

// =============================================================================
// Activity log (Sprint 16)
// =============================================================================

export interface ActivityEntry {
  id:            string;
  action:        string;
  entity_type:   string;
  entity_id:     string | null;
  entity_label:  string | null;
  operator_name: string;
  details:       unknown;
  created_at:    string;
}

export interface ActivityFilters {
  entity_type?: string;
  operator?:    string;
  from?:        string;
  to?:          string;
  limit?:       number;
}

// =============================================================================
// Global search (Sprint 17)
// =============================================================================

export interface SearchResult {
  type:      "project" | "customer" | "rule";
  id:        string;
  label:     string;
  sublabel?: string;
  path:      string;
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: ["search", q],
    queryFn:  () =>
      apiFetch<{ results: SearchResult[]; query: string }>(
        `/api/search?q=${encodeURIComponent(q)}&limit=5`
      ),
    enabled:   q.trim().length >= 2,
    staleTime: 10_000,
  });
}

export function useActivity(filters?: ActivityFilters) {
  const params = new URLSearchParams();
  if (filters?.entity_type) params.set("entity_type", filters.entity_type);
  if (filters?.operator)    params.set("operator",    filters.operator);
  if (filters?.from)        params.set("from",        filters.from);
  if (filters?.to)          params.set("to",          filters.to);
  if (filters?.limit)       params.set("limit",       String(filters.limit));
  const qs = params.toString() ? `?${params.toString()}` : "";
  return useQuery({
    queryKey: ["activity", filters ?? {}],
    queryFn:  () => apiFetch<{ entries: ActivityEntry[]; total: number }>(`/api/activity${qs}`),
    refetchInterval: 30_000,
  });
}

// =============================================================================
// Sprint 18 — Users directory (accessible à tous les rôles authentifiés)
// =============================================================================

export interface UserDirectory {
  id:   string;
  name: string;
}

export function useUsersDirectory() {
  return useQuery<{ users: UserDirectory[] }>({
    queryKey: ["users-directory"],
    queryFn:  () => apiFetch<{ users: UserDirectory[] }>("/api/users/directory"),
    staleTime: 60_000,
  });
}
