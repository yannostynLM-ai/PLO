import { OmsAdapter } from "./oms.adapter.js";
import { AdapterError, type RawIngestBody } from "./types.js";

const adapter = new OmsAdapter();

function validBody(overrides: Partial<RawIngestBody> = {}): RawIngestBody {
  return {
    source: "oms",
    source_ref: "REF-001",
    event_type: "shipment.dispatched",
    project_ref: "PROJ-001",
    occurred_at: "2024-06-15T10:00:00.000Z",
    payload: { shipment_id: "SHP-001" },
    ...overrides,
  };
}

// =============================================================================
// Base behaviour
// =============================================================================

describe("OmsAdapter", () => {
  it("returns a NormalizedEvent with source 'oms'", () => {
    const result = adapter.adapt(validBody());
    expect(result.source).toBe("oms");
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

  it("throws AdapterError when occurred_at is missing", () => {
    const body = validBody();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (body as any).occurred_at;
    expect(() => adapter.adapt(body)).toThrow(AdapterError);
  });

  // ===========================================================================
  // Invalid occurred_at
  // ===========================================================================

  it("throws AdapterError for non-ISO8601 occurred_at", () => {
    expect(() => adapter.adapt(validBody({ occurred_at: "not-a-date" }))).toThrow(AdapterError);
  });

  // ===========================================================================
  // shipment.dispatched requires shipment_id
  // ===========================================================================

  it("throws AdapterError for shipment.dispatched without shipment_id", () => {
    expect(() =>
      adapter.adapt(validBody({ event_type: "shipment.dispatched", payload: {} })),
    ).toThrow(AdapterError);
  });

  // ===========================================================================
  // consolidation.order_arrived
  // ===========================================================================

  it("accepts consolidation.order_arrived with required fields", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "consolidation.order_arrived",
        payload: {
          consolidation_id: "CON-001",
          order_id: "ORD-001",
          arrived_at: "2024-06-15T12:00:00.000Z",
        },
      }),
    );
    expect(result.event_type).toBe("consolidation.order_arrived");
  });

  it("throws AdapterError for consolidation.order_arrived without consolidation_id", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          event_type: "consolidation.order_arrived",
          payload: { order_id: "ORD-001", arrived_at: "2024-06-15T12:00:00.000Z" },
        }),
      ),
    ).toThrow(AdapterError);
  });

  it("throws AdapterError for consolidation.order_arrived without order_id", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          event_type: "consolidation.order_arrived",
          payload: { consolidation_id: "CON-001", arrived_at: "2024-06-15T12:00:00.000Z" },
        }),
      ),
    ).toThrow(AdapterError);
  });

  // ===========================================================================
  // shipment.eta_updated with delay_days and reason
  // ===========================================================================

  it("accepts shipment.eta_updated with delay_days and reason", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "shipment.eta_updated",
        payload: {
          shipment_id: "SHP-001",
          delay_days: 3,
          reason: "Customs hold",
        },
      }),
    );
    expect(result.event_type).toBe("shipment.eta_updated");
  });
});
