import { TmsAdapter } from "./tms.adapter.js";
import { AdapterError, type RawIngestBody } from "./types.js";

const adapter = new TmsAdapter();

function validBody(overrides: Partial<RawIngestBody> = {}): RawIngestBody {
  return {
    source: "tms_lastmile",
    source_ref: "REF-001",
    event_type: "lastmile.scheduled",
    project_ref: "PROJ-001",
    occurred_at: "2024-06-15T10:00:00.000Z",
    payload: {
      lastmile_id: "LM-001",
      scheduled_date: "2024-06-20T08:00:00.000Z",
    },
    ...overrides,
  };
}

// =============================================================================
// Base behaviour
// =============================================================================

describe("TmsAdapter", () => {
  it("returns a NormalizedEvent with source 'tms_lastmile'", () => {
    const result = adapter.adapt(validBody());
    expect(result.source).toBe("tms_lastmile");
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
    expect(() => adapter.adapt(validBody({ occurred_at: "15/06/2024" }))).toThrow(AdapterError);
  });

  // ===========================================================================
  // lastmile.scheduled requires lastmile_id and scheduled_date
  // ===========================================================================

  it("throws AdapterError for lastmile.scheduled without lastmile_id", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          payload: { scheduled_date: "2024-06-20T08:00:00.000Z" },
        }),
      ),
    ).toThrow(AdapterError);
  });

  it("throws AdapterError for lastmile.scheduled without scheduled_date", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          payload: { lastmile_id: "LM-001" },
        }),
      ),
    ).toThrow(AdapterError);
  });

  // ===========================================================================
  // lastmile.partial_delivered requires missing_order_ids with at least 1 item
  // ===========================================================================

  it("throws AdapterError for lastmile.partial_delivered with empty missing_order_ids", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          event_type: "lastmile.partial_delivered",
          payload: {
            lastmile_id: "LM-001",
            delivered_at: "2024-06-20T14:00:00.000Z",
            missing_order_ids: [],
          },
        }),
      ),
    ).toThrow(AdapterError);
  });

  it("accepts lastmile.partial_delivered with at least 1 missing_order_id", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "lastmile.partial_delivered",
        payload: {
          lastmile_id: "LM-001",
          delivered_at: "2024-06-20T14:00:00.000Z",
          missing_order_ids: ["ORD-X"],
        },
      }),
    );
    expect(result.event_type).toBe("lastmile.partial_delivered");
  });

  // ===========================================================================
  // time_slot with valid HH:MM format accepted
  // ===========================================================================

  it("accepts time_slot with valid HH:MM format", () => {
    const result = adapter.adapt(
      validBody({
        payload: {
          lastmile_id: "LM-001",
          scheduled_date: "2024-06-20T08:00:00.000Z",
          time_slot: { start: "08:00", end: "12:00" },
        },
      }),
    );
    expect(result.event_type).toBe("lastmile.scheduled");
  });
});
