import { WfmAdapter } from "./wfm.adapter.js";
import { AdapterError, type RawIngestBody } from "./types.js";

const adapter = new WfmAdapter();

function validBody(overrides: Partial<RawIngestBody> = {}): RawIngestBody {
  return {
    source: "wfm",
    source_ref: "REF-001",
    event_type: "installation.scheduled",
    project_ref: "PROJ-001",
    occurred_at: "2024-06-15T10:00:00.000Z",
    payload: {
      wfm_job_ref: "WFM-001",
      scheduled_date: "2024-06-20T08:00:00.000Z",
    },
    ...overrides,
  };
}

// =============================================================================
// Base behaviour
// =============================================================================

describe("WfmAdapter", () => {
  it("returns a NormalizedEvent with source 'wfm'", () => {
    const result = adapter.adapt(validBody());
    expect(result.source).toBe("wfm");
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

  it("throws AdapterError when source_ref is missing", () => {
    const body = validBody();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (body as any).source_ref;
    expect(() => adapter.adapt(body)).toThrow(AdapterError);
  });

  it("throws AdapterError for non-ISO8601 occurred_at", () => {
    expect(() => adapter.adapt(validBody({ occurred_at: "not-valid" }))).toThrow(AdapterError);
  });

  // ===========================================================================
  // installation.scheduled requires wfm_job_ref and scheduled_date
  // ===========================================================================

  it("throws AdapterError for installation.scheduled without wfm_job_ref", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          payload: { scheduled_date: "2024-06-20T08:00:00.000Z" },
        }),
      ),
    ).toThrow(AdapterError);
  });

  it("throws AdapterError for installation.scheduled without scheduled_date", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          payload: { wfm_job_ref: "WFM-001" },
        }),
      ),
    ).toThrow(AdapterError);
  });

  // ===========================================================================
  // installation.issue with severity and missing_skus
  // ===========================================================================

  it("accepts installation.issue with severity and missing_skus", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "installation.issue",
        payload: {
          severity: "blocking",
          missing_skus: ["SKU-A", "SKU-B"],
        },
      }),
    );
    expect(result.event_type).toBe("installation.issue");
  });

  // ===========================================================================
  // customer_signature.signed requires signed boolean
  // ===========================================================================

  it("accepts customer_signature.signed with signed boolean", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "customer_signature.signed",
        payload: { signed: true },
      }),
    );
    expect(result.event_type).toBe("customer_signature.signed");
  });

  it("throws AdapterError for customer_signature.signed without signed field", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          event_type: "customer_signature.signed",
          payload: {},
        }),
      ),
    ).toThrow(AdapterError);
  });
});
