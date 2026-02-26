// =============================================================================
// Factory EvaluationContext — pour tests de règles d'anomalie
// =============================================================================

import type { EvaluationContext } from "../../anomaly/types.js";

interface ContextOverrides {
  event?: Partial<EvaluationContext["event"]>;
  project?: Partial<EvaluationContext["project"]>;
  order?: Partial<NonNullable<EvaluationContext["order"]>> | null;
  installation?: Partial<NonNullable<EvaluationContext["installation"]>> | null;
}

export function createMockContext(overrides: ContextOverrides = {}): EvaluationContext {
  const now = new Date();

  const defaultEvent = {
    id: "evt-test-001",
    project_id: "proj-test-001",
    order_id: null,
    event_type: "stock.shortage",
    source: "erp" as const,
    source_ref: "ERP-EVT-001",
    severity: "critical",
    payload: {},
    acknowledged_by: null,
    processed_at: now,
    created_at: now,
    updated_at: now,
    ...overrides.event,
  };

  const defaultProject = {
    id: "proj-test-001",
    customer_id: "CLI-DUBOIS-2024",
    project_type: "kitchen" as const,
    channel_origin: "store" as const,
    status: "active" as const,
    store_id: null,
    assigned_to: null,
    tracking_token: "dubois-2024-suivi",
    anomaly_severity: null,
    created_at: now,
    updated_at: now,
    consolidation: null,
    last_mile: null,
    installation: null,
    orders: [],
    ...overrides.project,
  };

  const defaultOrder = overrides.order === null
    ? null
    : {
        id: "ord-test-001",
        project_id: "proj-test-001",
        erp_order_ref: "ERP-CMD-001",
        ecommerce_order_ref: null,
        status: "confirmed" as const,
        promised_delivery_date: new Date(Date.now() + 48 * 3_600_000),
        promised_installation_date: null,
        delivery_address: null,
        created_at: now,
        updated_at: now,
        ...(overrides.order ?? {}),
      };

  const defaultInstallation = overrides.installation === null
    ? null
    : overrides.installation
      ? {
          id: "inst-test-001",
          project_id: "proj-test-001",
          wfm_job_ref: null,
          status: "scheduled" as const,
          scheduled_date: new Date(Date.now() + 72 * 3_600_000),
          scheduled_slot: null,
          technician_id: null,
          technician_name: "Jean Dupont",
          installation_address: null,
          started_at: null,
          completed_at: null,
          report: null,
          orders_prerequisite: [],
          created_at: now,
          updated_at: now,
          ...overrides.installation,
        }
      : null;

  return {
    event: defaultEvent,
    project: defaultProject,
    order: defaultOrder,
    installation: defaultInstallation,
  } as unknown as EvaluationContext;
}
