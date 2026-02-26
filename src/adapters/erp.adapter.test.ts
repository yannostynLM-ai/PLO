import { ErpAdapter } from "./erp.adapter.js";
import { AdapterError, type RawIngestBody } from "./types.js";

const adapter = new ErpAdapter();

function validBody(overrides: Partial<RawIngestBody> = {}): RawIngestBody {
  return {
    source: "erp",
    source_ref: "REF-001",
    event_type: "inspiration.started",
    project_ref: "PROJ-001",
    occurred_at: "2024-06-15T10:00:00.000Z",
    payload: {},
    ...overrides,
  };
}

// =============================================================================
// Base behaviour
// =============================================================================

describe("ErpAdapter", () => {
  it("returns a NormalizedEvent with source 'erp'", () => {
    const result = adapter.adapt(validBody());
    expect(result.source).toBe("erp");
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

  it("preserves order_ref when provided", () => {
    const result = adapter.adapt(validBody({ order_ref: "ORD-42" }));
    expect(result.order_ref).toBe("ORD-42");
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

  it("throws AdapterError when event_type is missing", () => {
    const body = validBody();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (body as any).event_type;
    expect(() => adapter.adapt(body)).toThrow(AdapterError);
  });

  it("throws AdapterError when project_ref is missing", () => {
    const body = validBody();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (body as any).project_ref;
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

  it("throws AdapterError for date-only occurred_at (no time)", () => {
    expect(() => adapter.adapt(validBody({ occurred_at: "2024-06-15" }))).toThrow(AdapterError);
  });

  // ===========================================================================
  // stock.shortage
  // ===========================================================================

  it("accepts stock.shortage with shortage_skus array", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "stock.shortage",
        payload: { shortage_skus: ["SKU-A", "SKU-B"] },
      }),
    );
    expect(result.event_type).toBe("stock.shortage");
  });

  it("accepts stock.shortage with single sku field (retro-compat)", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "stock.shortage",
        payload: { sku: "SKU-A" },
      }),
    );
    expect(result.event_type).toBe("stock.shortage");
  });

  it("throws AdapterError for stock.shortage with neither sku nor shortage_skus", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          event_type: "stock.shortage",
          payload: {},
        }),
      ),
    ).toThrow(AdapterError);
  });

  // ===========================================================================
  // order.confirmed
  // ===========================================================================

  it("accepts order.confirmed with full payload", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "order.confirmed",
        payload: {
          erp_order_ref: "ERP-ORD-001",
          lines: [{ sku: "SKU-1", qty: 2 }],
        },
      }),
    );
    expect(result.event_type).toBe("order.confirmed");
  });

  it("throws AdapterError for order.confirmed without erp_order_ref", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          event_type: "order.confirmed",
          payload: { lines: [{ sku: "SKU-1", qty: 2 }] },
        }),
      ),
    ).toThrow(AdapterError);
  });

  // ===========================================================================
  // picking.discrepancy
  // ===========================================================================

  it("accepts picking.discrepancy with missing_skus", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "picking.discrepancy",
        payload: { missing_skus: ["SKU-X"] },
      }),
    );
    expect(result.event_type).toBe("picking.discrepancy");
  });

  it("accepts picking.discrepancy with empty payload (all optional)", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "picking.discrepancy",
        payload: {},
      }),
    );
    expect(result.event_type).toBe("picking.discrepancy");
  });
});
