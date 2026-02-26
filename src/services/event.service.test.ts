import { describe, it, expect } from "vitest";
import { deriveSeverity } from "./event.service.js";

// =============================================================================
// Tests unitaires — deriveSeverity()
// =============================================================================

describe("deriveSeverity", () => {
  it("returns critical for stock.shortage", () => {
    expect(deriveSeverity("stock.shortage")).toBe("critical");
  });

  it("returns critical for picking.discrepancy", () => {
    expect(deriveSeverity("picking.discrepancy")).toBe("critical");
  });

  it("returns critical for shipment.exception", () => {
    expect(deriveSeverity("shipment.exception")).toBe("critical");
  });

  it("returns critical for lastmile.failed", () => {
    expect(deriveSeverity("lastmile.failed")).toBe("critical");
  });

  it("returns critical for installation.issue", () => {
    expect(deriveSeverity("installation.issue")).toBe("critical");
  });

  it("returns warning for stock.partial", () => {
    expect(deriveSeverity("stock.partial")).toBe("warning");
  });

  it("returns warning for shipment.eta_updated", () => {
    expect(deriveSeverity("shipment.eta_updated")).toBe("warning");
  });

  it("returns warning for installation.rescheduled", () => {
    expect(deriveSeverity("installation.rescheduled")).toBe("warning");
  });

  it("returns info for order.confirmed", () => {
    expect(deriveSeverity("order.confirmed")).toBe("info");
  });

  it("returns info for unknown event_type", () => {
    expect(deriveSeverity("some.unknown.event")).toBe("info");
  });

  it("returns info for inspiration.started", () => {
    expect(deriveSeverity("inspiration.started")).toBe("info");
  });
});
