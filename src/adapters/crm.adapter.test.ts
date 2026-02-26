import { CrmAdapter } from "./crm.adapter.js";
import { AdapterError, type RawIngestBody } from "./types.js";

const adapter = new CrmAdapter();

function validBody(overrides: Partial<RawIngestBody> = {}): RawIngestBody {
  return {
    source: "crm",
    source_ref: "REF-001",
    event_type: "project.closed",
    project_ref: "PROJ-001",
    occurred_at: "2024-06-15T10:00:00.000Z",
    payload: {},
    ...overrides,
  };
}

// =============================================================================
// Base behaviour
// =============================================================================

describe("CrmAdapter", () => {
  it("returns a NormalizedEvent with source 'crm'", () => {
    const result = adapter.adapt(validBody());
    expect(result.source).toBe("crm");
  });

  it("returns occurred_at as a Date instance", () => {
    const result = adapter.adapt(validBody());
    expect(result.occurred_at).toBeInstanceOf(Date);
    expect(result.occurred_at.toISOString()).toBe("2024-06-15T10:00:00.000Z");
  });

  it("preserves project_ref", () => {
    const result = adapter.adapt(validBody({ project_ref: "PROJ-999" }));
    expect(result.project_ref).toBe("PROJ-999");
  });

  // ===========================================================================
  // Invalid event_type
  // ===========================================================================

  it("throws AdapterError for unknown event_type", () => {
    expect(() => adapter.adapt(validBody({ event_type: "unknown.event" }))).toThrow(AdapterError);
  });

  // ===========================================================================
  // Missing required fields
  // ===========================================================================

  it("throws AdapterError when project_ref is missing", () => {
    const body = validBody();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (body as any).project_ref;
    expect(() => adapter.adapt(body)).toThrow(AdapterError);
  });

  it("throws AdapterError for non-ISO8601 occurred_at", () => {
    expect(() => adapter.adapt(validBody({ occurred_at: "June 15 2024" }))).toThrow(AdapterError);
  });

  // ===========================================================================
  // sav.ticket_created requires crm_ticket_ref
  // ===========================================================================

  it("accepts sav.ticket_created with crm_ticket_ref", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "sav.ticket_created",
        payload: { crm_ticket_ref: "TKT-001" },
      }),
    );
    expect(result.event_type).toBe("sav.ticket_created");
  });

  it("throws AdapterError for sav.ticket_created without crm_ticket_ref", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          event_type: "sav.ticket_created",
          payload: {},
        }),
      ),
    ).toThrow(AdapterError);
  });

  // ===========================================================================
  // quality.survey_completed with score and nps
  // ===========================================================================

  it("accepts quality.survey_completed with score and nps", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "quality.survey_completed",
        payload: { score: 8, nps: 50 },
      }),
    );
    expect(result.event_type).toBe("quality.survey_completed");
  });
});
