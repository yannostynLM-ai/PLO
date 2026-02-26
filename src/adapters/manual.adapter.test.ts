import { ManualAdapter } from "./manual.adapter.js";
import { AdapterError, type RawIngestBody } from "./types.js";

const adapter = new ManualAdapter();

function validBody(overrides: Partial<RawIngestBody> = {}): RawIngestBody {
  return {
    source: "manual",
    source_ref: "REF-001",
    event_type: "anything.goes",
    project_ref: "PROJ-001",
    occurred_at: "2024-06-15T10:00:00.000Z",
    payload: {},
    ...overrides,
  };
}

// =============================================================================
// Base behaviour
// =============================================================================

describe("ManualAdapter", () => {
  it("returns a NormalizedEvent with source 'manual'", () => {
    const result = adapter.adapt(validBody());
    expect(result.source).toBe("manual");
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
  // Any event_type is accepted (no allow-list)
  // ===========================================================================

  it("accepts any event_type value", () => {
    const result = adapter.adapt(validBody({ event_type: "totally.custom.event" }));
    expect(result.event_type).toBe("totally.custom.event");
  });

  // ===========================================================================
  // Free-form payload is accepted
  // ===========================================================================

  it("accepts free-form payload", () => {
    const result = adapter.adapt(
      validBody({
        payload: { foo: "bar", nested: { deep: true }, count: 42 },
      }),
    );
    expect(result.payload).toEqual({ foo: "bar", nested: { deep: true }, count: 42 });
  });

  // ===========================================================================
  // Missing source_ref throws
  // ===========================================================================

  it("throws AdapterError when source_ref is missing", () => {
    const body = validBody();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (body as any).source_ref;
    expect(() => adapter.adapt(body)).toThrow(AdapterError);
  });

  // ===========================================================================
  // Invalid occurred_at
  // ===========================================================================

  it("throws AdapterError for non-ISO8601 occurred_at", () => {
    expect(() => adapter.adapt(validBody({ occurred_at: "bad-date" }))).toThrow(AdapterError);
  });
});
