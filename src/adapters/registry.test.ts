import { describe, it, expect } from "vitest";
import { getAdapter } from "./registry.js";

describe("getAdapter", () => {
  it("returns an adapter for a registered source", () => {
    const adapter = getAdapter("erp");
    expect(adapter).toBeDefined();
    expect(typeof adapter.adapt).toBe("function");
  });

  it("throws for an unregistered source", () => {
    expect(() => getAdapter("unknown_source" as any)).toThrow(
      "No adapter registered for source: unknown_source",
    );
  });
});
