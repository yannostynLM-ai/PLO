import { describe, it, expect } from "vitest";
import { validateStep, validateDeliveryAddress, validateTimeSlot } from "./validators.js";

// =============================================================================
// Tests unitaires — Validators
// =============================================================================

describe("validateStep", () => {
  it("accepts exactly one project_id", () => {
    expect(() => validateStep({ project_id: "p1" })).not.toThrow();
  });

  it("accepts exactly one order_id", () => {
    expect(() => validateStep({ order_id: "o1" })).not.toThrow();
  });

  it("accepts exactly one installation_id", () => {
    expect(() => validateStep({ installation_id: "i1" })).not.toThrow();
  });

  it("throws when zero non-null values", () => {
    expect(() => validateStep({})).toThrow("exactly one");
  });

  it("throws when all null", () => {
    expect(() =>
      validateStep({ project_id: null, order_id: null, installation_id: null })
    ).toThrow("exactly one");
  });

  it("throws when two non-null values", () => {
    expect(() =>
      validateStep({ project_id: "p1", order_id: "o1" })
    ).toThrow("exactly one");
  });

  it("throws when three non-null values", () => {
    expect(() =>
      validateStep({ project_id: "p1", order_id: "o1", installation_id: "i1" })
    ).toThrow("exactly one");
  });

  it("treats empty string as null", () => {
    expect(() => validateStep({ project_id: "", order_id: "o1" })).not.toThrow();
  });
});

describe("validateDeliveryAddress", () => {
  it("accepts a valid address", () => {
    expect(() =>
      validateDeliveryAddress({
        street: "12 rue de la Paix",
        city: "Paris",
        zip: "75002",
        country: "FR",
      })
    ).not.toThrow();
  });

  it("throws for null", () => {
    expect(() => validateDeliveryAddress(null)).toThrow("non-null object");
  });

  it("throws for non-object", () => {
    expect(() => validateDeliveryAddress("string")).toThrow("non-null object");
  });

  it("throws for missing street", () => {
    expect(() =>
      validateDeliveryAddress({ city: "Paris", zip: "75002", country: "FR" })
    ).toThrow("street");
  });

  it("throws for missing city", () => {
    expect(() =>
      validateDeliveryAddress({ street: "12 rue", zip: "75002", country: "FR" })
    ).toThrow("city");
  });

  it("throws for non-string field", () => {
    expect(() =>
      validateDeliveryAddress({
        street: 123,
        city: "Paris",
        zip: "75002",
        country: "FR",
      })
    ).toThrow("street");
  });
});

describe("validateTimeSlot", () => {
  it("accepts valid HH:MM format", () => {
    expect(() => validateTimeSlot({ start: "08:00", end: "12:00" })).not.toThrow();
  });

  it("accepts edge times 00:00 and 23:59", () => {
    expect(() => validateTimeSlot({ start: "00:00", end: "23:59" })).not.toThrow();
  });

  it("throws for null", () => {
    expect(() => validateTimeSlot(null)).toThrow("non-null object");
  });

  it("throws for invalid start format", () => {
    expect(() => validateTimeSlot({ start: "8:00", end: "12:00" })).toThrow(
      "start"
    );
  });

  it("throws for invalid end format", () => {
    expect(() => validateTimeSlot({ start: "08:00", end: "25:00" })).toThrow(
      "end"
    );
  });

  it("throws for non-string start", () => {
    expect(() => validateTimeSlot({ start: 800, end: "12:00" })).toThrow("start");
  });
});
