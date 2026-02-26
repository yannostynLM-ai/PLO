import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockContext } from "../../__tests__/helpers/mock-context.js";
import { createMockPrisma, type MockPrisma } from "../../__tests__/helpers/mock-prisma.js";
import { RULE_IDS } from "../rule-ids.js";

// =============================================================================
// Mock des dépendances
// =============================================================================

let mockPrisma: MockPrisma;

vi.mock("../../lib/prisma.js", () => ({
  get prisma() {
    return mockPrisma;
  },
}));

vi.mock("../../config.js", () => ({
  config: {
    ALERT_EMAILS: {
      coordinateur: "coord@test.fr",
      acheteur: "acheteur@test.fr",
      entrepot: "entrepot@test.fr",
      manager: "manager@test.fr",
      ops: "ops@test.fr",
    },
    JWT_SECRET: "test",
    DATABASE_URL: "test",
    REDIS_URL: "redis://localhost",
    API_KEYS: {},
    PORT: 3000,
    HOST: "0.0.0.0",
    SMTP_HOST: "",
    SMTP_PORT: 587,
    SMTP_USER: "",
    SMTP_PASS: "",
    SMTP_FROM: "test@test.fr",
    ESCALATION_HOURS: 4,
    ANTHROPIC_API_KEY: "",
    JWT_EXPIRES_IN: "8h",
    ADMIN_EMAIL: "admin@test.fr",
    ADMIN_PASSWORD: "",
  },
}));

// Import APRÈS les mocks
const { REALTIME_RULES } = await import("./realtime.rules.js");

function findRule(ruleId: string) {
  return REALTIME_RULES.find((r) => r.ruleId === ruleId)!;
}

// =============================================================================
// Tests — Règles temps réel
// =============================================================================

beforeEach(() => {
  mockPrisma = createMockPrisma();
});

// ---------------------------------------------------------------------------
// ANO-01 — Stock manquant tardif (< 72h)
// ---------------------------------------------------------------------------
describe("ANO-01 — Stock manquant tardif", () => {
  const rule = findRule(RULE_IDS.ANO_01);

  it("triggers when order delivery is in < 72h", async () => {
    const ctx = createMockContext({
      event: { event_type: "stock.shortage", payload: { sku: "SKU-001" } },
      order: { promised_delivery_date: new Date(Date.now() + 24 * 3_600_000) },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_01);
    expect(result!.recipients).toHaveLength(2);
  });

  it("returns null when delivery is > 72h away", async () => {
    const ctx = createMockContext({
      event: { event_type: "stock.shortage", payload: { sku: "SKU-001" } },
      order: { promised_delivery_date: new Date(Date.now() + 100 * 3_600_000) },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when order has no delivery date", async () => {
    const ctx = createMockContext({
      event: { event_type: "stock.shortage" },
      order: { promised_delivery_date: null },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when no order", async () => {
    const ctx = createMockContext({
      event: { event_type: "stock.shortage" },
      order: null,
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("handles multi-SKU shortage_skus", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "stock.shortage",
        payload: { shortage_skus: ["SKU-A", "SKU-B", "SKU-C"] },
      },
      order: { promised_delivery_date: new Date(Date.now() + 24 * 3_600_000) },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.bodyHtml).toContain("SKU-A");
    expect(result!.bodyHtml).toContain("SKU-B");
  });

  it("uses single sku when shortage_skus is empty", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "stock.shortage",
        payload: { sku: "SINGLE-SKU" },
      },
      order: { promised_delivery_date: new Date(Date.now() + 12 * 3_600_000) },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.bodyHtml).toContain("SINGLE-SKU");
  });

  it("has triggers for stock.shortage", () => {
    expect(rule.triggers).toContain("stock.shortage");
  });
});

// ---------------------------------------------------------------------------
// ANO-02 — Écart picking avant départ
// ---------------------------------------------------------------------------
describe("ANO-02 — Écart picking avant départ", () => {
  const rule = findRule(RULE_IDS.ANO_02);

  it("triggers when no dispatched shipment", async () => {
    mockPrisma.shipment.findFirst.mockResolvedValue(null);
    const ctx = createMockContext({
      event: { event_type: "picking.discrepancy" },
      order: {},
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_02);
    expect(result!.recipients[0].role).toBe("entrepot");
  });

  it("returns null when shipment already dispatched (→ ANO-03)", async () => {
    mockPrisma.shipment.findFirst.mockResolvedValue({ id: "ship-1", status: "dispatched" });
    const ctx = createMockContext({
      event: { event_type: "picking.discrepancy" },
      order: {},
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when no order", async () => {
    const ctx = createMockContext({
      event: { event_type: "picking.discrepancy" },
      order: null,
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANO-03 — Produit oublié après départ camion
// ---------------------------------------------------------------------------
describe("ANO-03 — Produit oublié après départ", () => {
  const rule = findRule(RULE_IDS.ANO_03);

  it("triggers when shipment already dispatched", async () => {
    mockPrisma.shipment.findFirst.mockResolvedValue({ id: "ship-1", status: "in_transit" });
    const ctx = createMockContext({
      event: { event_type: "picking.discrepancy" },
      order: {},
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_03);
  });

  it("returns null when no dispatched shipment (→ ANO-02)", async () => {
    mockPrisma.shipment.findFirst.mockResolvedValue(null);
    const ctx = createMockContext({
      event: { event_type: "picking.discrepancy" },
      order: {},
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANO-04 — Livraison partielle avant pose < 48h
// ---------------------------------------------------------------------------
describe("ANO-04 — Livraison partielle avant pose imminente", () => {
  const rule = findRule(RULE_IDS.ANO_04);

  it("triggers when installation is in < 48h", async () => {
    const ctx = createMockContext({
      event: { event_type: "lastmile.partial_delivered" },
      project: {
        installation: {
          id: "inst-1",
          scheduled_date: new Date(Date.now() + 24 * 3_600_000),
        } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_04);
  });

  it("returns null when installation is > 48h away", async () => {
    const ctx = createMockContext({
      event: { event_type: "lastmile.partial_delivered" },
      project: {
        installation: {
          id: "inst-1",
          scheduled_date: new Date(Date.now() + 100 * 3_600_000),
        } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when no installation", async () => {
    const ctx = createMockContext({
      event: { event_type: "lastmile.partial_delivered" },
      project: { installation: null },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANO-05 — Installation planifiée sans livraison confirmée
// ---------------------------------------------------------------------------
describe("ANO-05 — Installation sans livraison confirmée", () => {
  const rule = findRule(RULE_IDS.ANO_05);

  it("triggers when no delivery confirmed", async () => {
    const ctx = createMockContext({
      event: { event_type: "installation.scheduled" },
      project: {
        last_mile: { status: "scheduled" } as any,
        consolidation: { status: "in_progress" } as any,
      },
      installation: {},
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_05);
  });

  it("returns null when last_mile is delivered", async () => {
    const ctx = createMockContext({
      event: { event_type: "installation.scheduled" },
      project: {
        last_mile: { status: "delivered" } as any,
      },
      installation: {},
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when consolidation is complete", async () => {
    const ctx = createMockContext({
      event: { event_type: "installation.scheduled" },
      project: {
        last_mile: null,
        consolidation: { status: "complete" } as any,
      },
      installation: {},
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANO-06 — Problème pendant installation
// ---------------------------------------------------------------------------
describe("ANO-06 — Problème pendant installation", () => {
  const rule = findRule(RULE_IDS.ANO_06);

  it("triggers on installation.issue (always returns result)", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "installation.issue",
        payload: { severity: "minor" },
      },
      project: {
        installation: {
          id: "inst-1",
          technician_name: "Jean",
          scheduled_date: new Date(),
        } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_06);
  });

  it("includes blocking info when severity is blocking", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "installation.issue",
        payload: { severity: "blocking" },
      },
      project: {
        installation: {
          id: "inst-1",
          scheduled_date: new Date(),
        } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.subject).toContain("BLOQUANT");
  });
});

// ---------------------------------------------------------------------------
// ANO-11 — Installation sans commandes prérequises livrées
// ---------------------------------------------------------------------------
describe("ANO-11 — Installation prérequises non livrées", () => {
  const rule = findRule(RULE_IDS.ANO_11);

  it("triggers when prerequisite orders not delivered", async () => {
    const ctx = createMockContext({
      event: { event_type: "installation.scheduled" },
      project: {
        installation: {
          id: "inst-1",
          orders_prerequisite: ["ord-1", "ord-2"],
        } as any,
        orders: [
          { id: "ord-1", status: "confirmed", erp_order_ref: "ERP-1" },
          { id: "ord-2", status: "confirmed", erp_order_ref: "ERP-2" },
        ] as any[],
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
  });

  it("returns null when all prerequisite orders delivered", async () => {
    const ctx = createMockContext({
      event: { event_type: "installation.scheduled" },
      project: {
        installation: {
          id: "inst-1",
          orders_prerequisite: ["ord-1"],
        } as any,
        orders: [
          { id: "ord-1", status: "delivered", erp_order_ref: "ERP-1" },
        ] as any[],
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when no prerequisites", async () => {
    const ctx = createMockContext({
      event: { event_type: "installation.scheduled" },
      project: {
        installation: {
          id: "inst-1",
          orders_prerequisite: [],
        } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when no installation", async () => {
    const ctx = createMockContext({
      event: { event_type: "installation.scheduled" },
      project: { installation: null },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANO-12 — Incident bloquant en installation
// ---------------------------------------------------------------------------
describe("ANO-12 — Incident bloquant", () => {
  const rule = findRule(RULE_IDS.ANO_12);

  it("triggers when severity is blocking", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "installation.issue",
        payload: { severity: "blocking" },
      },
      project: {
        installation: { id: "inst-1", scheduled_date: new Date() } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_12);
    expect(result!.recipients).toHaveLength(2); // coordinateur + manager
  });

  it("returns null when severity is not blocking", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "installation.issue",
        payload: { severity: "minor" },
      },
      project: {
        installation: { id: "inst-1", scheduled_date: new Date() } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("triggers with is_blocking flag", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "installation.issue",
        payload: { is_blocking: true },
      },
      project: {
        installation: { id: "inst-1", scheduled_date: new Date() } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANO-15 — Refus de signature client
// ---------------------------------------------------------------------------
describe("ANO-15 — Refus signature client", () => {
  const rule = findRule(RULE_IDS.ANO_15);

  it("triggers when customer_signature.signed is false", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "installation.completed",
        payload: { customer_signature: { signed: false, refusal_reason: "pas satisfait" } },
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_15);
  });

  it("returns null when customer_signature.signed is true", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "installation.completed",
        payload: { customer_signature: { signed: true } },
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when no customer_signature in payload", async () => {
    const ctx = createMockContext({
      event: { event_type: "installation.completed", payload: {} },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANO-16 — ETA dépasse date de livraison promise
// ---------------------------------------------------------------------------
describe("ANO-16 — ETA dépasse date promise", () => {
  const rule = findRule(RULE_IDS.ANO_16);

  it("triggers when new ETA > promised delivery date", async () => {
    const promisedDate = new Date("2024-06-20");
    const ctx = createMockContext({
      event: {
        event_type: "shipment.eta_updated",
        payload: { new_eta: "2024-06-25T00:00:00.000Z" },
      },
      order: { promised_delivery_date: promisedDate },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_16);
  });

  it("returns null when ETA <= promised date", async () => {
    const promisedDate = new Date("2024-06-25");
    const ctx = createMockContext({
      event: {
        event_type: "shipment.eta_updated",
        payload: { new_eta: "2024-06-20T00:00:00.000Z" },
      },
      order: { promised_delivery_date: promisedDate },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when no new_eta in payload", async () => {
    const ctx = createMockContext({
      event: { event_type: "shipment.eta_updated", payload: {} },
      order: { promised_delivery_date: new Date() },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when order has no promised date", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "shipment.eta_updated",
        payload: { new_eta: "2024-06-25T00:00:00.000Z" },
      },
      order: { promised_delivery_date: null },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("uses estimated_arrival fallback", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "shipment.eta_updated",
        payload: { estimated_arrival: "2024-07-01T00:00:00.000Z" },
      },
      order: { promised_delivery_date: new Date("2024-06-20") },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANO-18 — Exception en delivery station
// ---------------------------------------------------------------------------
describe("ANO-18 — Exception delivery station", () => {
  const rule = findRule(RULE_IDS.ANO_18);

  it("always triggers on consolidation.exception", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "consolidation.exception",
        payload: { reason: "Colis endommagé" },
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_18);
    expect(result!.recipients).toHaveLength(2);
  });

  it("uses default reason when not in payload", async () => {
    const ctx = createMockContext({
      event: { event_type: "consolidation.exception", payload: {} },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.bodyText).toContain("Incident non détaillé");
  });
});

// ---------------------------------------------------------------------------
// ANO-19 — Last mile sans consolidation complète
// ---------------------------------------------------------------------------
describe("ANO-19 — Last mile sans consolidation", () => {
  const rule = findRule(RULE_IDS.ANO_19);

  it("triggers when consolidation not complete", async () => {
    const ctx = createMockContext({
      event: { event_type: "lastmile.scheduled" },
      project: {
        consolidation: {
          id: "conso-1",
          status: "in_progress",
          orders_required: ["ord-1", "ord-2"],
          orders_arrived: ["ord-1"],
        } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_19);
  });

  it("returns null when consolidation is complete", async () => {
    const ctx = createMockContext({
      event: { event_type: "lastmile.scheduled" },
      project: {
        consolidation: {
          id: "conso-1",
          status: "complete",
          orders_required: ["ord-1"],
          orders_arrived: ["ord-1"],
        } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when consolidation is partial_approved", async () => {
    const ctx = createMockContext({
      event: { event_type: "lastmile.scheduled" },
      project: {
        consolidation: {
          id: "conso-1",
          status: "partial_approved",
          orders_required: ["ord-1"],
          orders_arrived: [],
        } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });

  it("returns null when no consolidation", async () => {
    const ctx = createMockContext({
      event: { event_type: "lastmile.scheduled" },
      project: { consolidation: null },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANO-20 — Last mile partiel sans accord préalable
// ---------------------------------------------------------------------------
describe("ANO-20 — Last mile partiel sans accord", () => {
  const rule = findRule(RULE_IDS.ANO_20);

  it("triggers when no partial_delivery_approved", async () => {
    const ctx = createMockContext({
      event: { event_type: "lastmile.partial_delivered" },
      project: {
        consolidation: { partial_delivery_approved: false } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_20);
    expect(result!.recipients[0].role).toBe("manager");
  });

  it("returns null when partial_delivery_approved is true", async () => {
    const ctx = createMockContext({
      event: { event_type: "lastmile.partial_delivered" },
      project: {
        consolidation: { partial_delivery_approved: true } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANO-22 — Échec livraison last mile
// ---------------------------------------------------------------------------
describe("ANO-22 — Last mile échoué", () => {
  const rule = findRule(RULE_IDS.ANO_22);

  it("always triggers on lastmile.failed", async () => {
    const ctx = createMockContext({
      event: {
        event_type: "lastmile.failed",
        payload: { reason: "Client absent" },
      },
      project: {
        last_mile: { scheduled_date: new Date() } as any,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe(RULE_IDS.ANO_22);
    expect(result!.bodyText).toContain("Client absent");
  });

  it("includes default reason when not provided", async () => {
    const ctx = createMockContext({
      event: { event_type: "lastmile.failed", payload: {} },
      project: { last_mile: null },
    });
    const result = await rule.evaluate(ctx);
    expect(result).not.toBeNull();
    expect(result!.bodyText).toContain("Motif non précisé");
  });
});

// ---------------------------------------------------------------------------
// Vérification globale — nombre et structure des règles
// ---------------------------------------------------------------------------
describe("REALTIME_RULES structure", () => {
  it("exports 14 rules", () => {
    expect(REALTIME_RULES).toHaveLength(14);
  });

  it("all rules have ruleId, name, triggers, evaluate", () => {
    for (const rule of REALTIME_RULES) {
      expect(rule.ruleId).toBeDefined();
      expect(rule.name).toBeDefined();
      expect(rule.triggers.length).toBeGreaterThan(0);
      expect(typeof rule.evaluate).toBe("function");
    }
  });
});
