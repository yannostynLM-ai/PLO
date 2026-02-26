import { EcommerceAdapter } from "./ecommerce.adapter.js";
import { AdapterError, type RawIngestBody } from "./types.js";

const adapter = new EcommerceAdapter();

function validBody(overrides: Partial<RawIngestBody> = {}): RawIngestBody {
  return {
    source: "ecommerce",
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

describe("EcommerceAdapter", () => {
  it("returns a NormalizedEvent with source 'ecommerce'", () => {
    const result = adapter.adapt(validBody());
    expect(result.source).toBe("ecommerce");
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

  it("throws AdapterError for non-ISO8601 occurred_at", () => {
    expect(() => adapter.adapt(validBody({ occurred_at: "nope" }))).toThrow(AdapterError);
  });

  // ===========================================================================
  // cart.created requires ecommerce_cart_ref
  // ===========================================================================

  it("accepts cart.created with ecommerce_cart_ref", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "cart.created",
        payload: { ecommerce_cart_ref: "CART-001" },
      }),
    );
    expect(result.event_type).toBe("cart.created");
  });

  it("throws AdapterError for cart.created without ecommerce_cart_ref", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          event_type: "cart.created",
          payload: {},
        }),
      ),
    ).toThrow(AdapterError);
  });

  // ===========================================================================
  // order.confirmed requires ecommerce_order_ref
  // ===========================================================================

  it("accepts order.confirmed with ecommerce_order_ref", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "order.confirmed",
        payload: { ecommerce_order_ref: "ECOM-ORD-001" },
      }),
    );
    expect(result.event_type).toBe("order.confirmed");
  });

  it("throws AdapterError for order.confirmed without ecommerce_order_ref", () => {
    expect(() =>
      adapter.adapt(
        validBody({
          event_type: "order.confirmed",
          payload: {},
        }),
      ),
    ).toThrow(AdapterError);
  });

  // ===========================================================================
  // payment.confirmed with transaction_ref
  // ===========================================================================

  it("accepts payment.confirmed with transaction_ref", () => {
    const result = adapter.adapt(
      validBody({
        event_type: "payment.confirmed",
        payload: { transaction_ref: "TXN-42" },
      }),
    );
    expect(result.event_type).toBe("payment.confirmed");
  });
});
