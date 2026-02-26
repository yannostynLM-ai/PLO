import { describe, it, expect, vi, beforeEach } from "vitest";
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

const {
  ano07, ano08, ano09, ano10, ano13, ano14, ano17, ano21,
  HOURLY_RULES, DAILY_RULES,
} = await import("./scheduled.rules.js");

beforeEach(() => {
  mockPrisma = createMockPrisma();
});

// =============================================================================
// ANO-07 — Livraison non planifiée J-5 avant installation
// =============================================================================
describe("ANO-07 — Livraison non planifiée J-5", () => {
  it("returns results for installations in 5-6 days without scheduled last mile", async () => {
    mockPrisma.installation.findMany.mockResolvedValue([
      {
        id: "inst-1",
        scheduled_date: new Date(Date.now() + 5.5 * 86_400_000),
        project: {
          id: "proj-1",
          customer_id: "CLI-001",
          last_mile: { status: "waiting" },
        },
      },
    ]);
    const results = await ano07.evaluate();
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe(RULE_IDS.ANO_07);
  });

  it("returns empty array when no matching installations", async () => {
    mockPrisma.installation.findMany.mockResolvedValue([]);
    const results = await ano07.evaluate();
    expect(results).toHaveLength(0);
  });

  it("is a daily rule", () => {
    expect(ano07.frequency).toBe("daily");
  });
});

// =============================================================================
// ANO-08 — Picking non démarré H-8
// =============================================================================
describe("ANO-08 — Picking non démarré H-8", () => {
  it("returns results for orders with imminent delivery and no picking", async () => {
    mockPrisma.order.findMany.mockResolvedValue([
      {
        id: "ord-1",
        erp_order_ref: "ERP-001",
        promised_delivery_date: new Date(Date.now() + 4 * 3_600_000),
        project: { id: "proj-1", customer_id: "CLI-001" },
      },
    ]);
    const results = await ano08.evaluate();
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe(RULE_IDS.ANO_08);
    expect(results[0].recipients[0].role).toBe("entrepot");
  });

  it("returns empty when no matching orders", async () => {
    mockPrisma.order.findMany.mockResolvedValue([]);
    const results = await ano08.evaluate();
    expect(results).toHaveLength(0);
  });

  it("is an hourly rule", () => {
    expect(ano08.frequency).toBe("hourly");
  });
});

// =============================================================================
// ANO-09 — Pas de clôture livraison H+4
// =============================================================================
describe("ANO-09 — Pas de clôture livraison H+4", () => {
  it("returns results for overdue last miles without closure event", async () => {
    mockPrisma.lastMileDelivery.findMany.mockResolvedValue([
      {
        id: "lm-1",
        project_id: "proj-1",
        status: "in_transit",
        scheduled_date: new Date(Date.now() - 6 * 3_600_000),
        project: { id: "proj-1", customer_id: "CLI-001" },
      },
    ]);
    mockPrisma.event.findFirst.mockResolvedValue(null);

    const results = await ano09.evaluate();
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe(RULE_IDS.ANO_09);
  });

  it("skips last miles that have closure events", async () => {
    mockPrisma.lastMileDelivery.findMany.mockResolvedValue([
      {
        id: "lm-1",
        project_id: "proj-1",
        status: "in_transit",
        scheduled_date: new Date(Date.now() - 6 * 3_600_000),
        project: { id: "proj-1", customer_id: "CLI-001" },
      },
    ]);
    mockPrisma.event.findFirst.mockResolvedValue({ id: "evt-closure" });

    const results = await ano09.evaluate();
    expect(results).toHaveLength(0);
  });

  it("returns empty when no overdue last miles", async () => {
    mockPrisma.lastMileDelivery.findMany.mockResolvedValue([]);
    const results = await ano09.evaluate();
    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// ANO-10 — Devis pose non créé H+48
// =============================================================================
describe("ANO-10 — Devis pose non créé H+48", () => {
  it("returns results for projects with accepted quote but no installation quote", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      { id: "proj-1", customer_id: "CLI-001" },
    ]);
    const results = await ano10.evaluate();
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe(RULE_IDS.ANO_10);
  });

  it("returns empty when no matching projects", async () => {
    mockPrisma.project.findMany.mockResolvedValue([]);
    const results = await ano10.evaluate();
    expect(results).toHaveLength(0);
  });

  it("is a daily rule", () => {
    expect(ano10.frequency).toBe("daily");
  });
});

// =============================================================================
// ANO-13 — Technicien en retard >2h
// =============================================================================
describe("ANO-13 — Technicien en retard", () => {
  it("returns results for overdue installations", async () => {
    mockPrisma.installation.findMany.mockResolvedValue([
      {
        id: "inst-1",
        scheduled_date: new Date(Date.now() - 3 * 3_600_000),
        started_at: null,
        technician_name: "Pierre Martin",
        project: { id: "proj-1", customer_id: "CLI-001" },
      },
    ]);
    const results = await ano13.evaluate();
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe(RULE_IDS.ANO_13);
    expect(results[0].bodyText).toContain("Pierre Martin");
  });

  it("returns empty when no overdue installations", async () => {
    mockPrisma.installation.findMany.mockResolvedValue([]);
    const results = await ano13.evaluate();
    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// ANO-14 — Compte-rendu non soumis H+4
// =============================================================================
describe("ANO-14 — Compte-rendu non soumis", () => {
  it("returns results for completed installations without report", async () => {
    mockPrisma.installation.findMany.mockResolvedValue([
      {
        id: "inst-1",
        completed_at: new Date(Date.now() - 6 * 3_600_000),
        technician_name: "Marie Curie",
        project_id: "proj-1",
        project: { id: "proj-1", customer_id: "CLI-001" },
      },
    ]);
    const results = await ano14.evaluate();
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe(RULE_IDS.ANO_14);
  });

  it("returns empty when no overdue reports", async () => {
    mockPrisma.installation.findMany.mockResolvedValue([]);
    const results = await ano14.evaluate();
    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// ANO-17 — Consolidation incomplète J-3
// =============================================================================
describe("ANO-17 — Consolidation incomplète J-3", () => {
  it("returns results for incomplete consolidations with upcoming delivery", async () => {
    mockPrisma.consolidation.findMany.mockResolvedValue([
      {
        id: "conso-1",
        project_id: "proj-1",
        status: "in_progress",
        orders_required: ["ord-1", "ord-2", "ord-3"],
        orders_arrived: ["ord-1"],
        estimated_complete_date: new Date(Date.now() + 2 * 86_400_000),
        project: {
          id: "proj-1",
          customer_id: "CLI-001",
          orders: [
            {
              promised_delivery_date: new Date(Date.now() + 2 * 86_400_000),
              erp_order_ref: "ERP-1",
            },
          ],
        },
      },
    ]);
    const results = await ano17.evaluate();
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe(RULE_IDS.ANO_17);
  });

  it("returns empty when no incomplete consolidations", async () => {
    mockPrisma.consolidation.findMany.mockResolvedValue([]);
    const results = await ano17.evaluate();
    expect(results).toHaveLength(0);
  });

  it("is a daily rule", () => {
    expect(ano17.frequency).toBe("daily");
  });
});

// =============================================================================
// ANO-21 — Silence OMS >24h
// =============================================================================
describe("ANO-21 — Silence OMS >24h", () => {
  it("returns results for stale shipments", async () => {
    mockPrisma.shipment.findMany.mockResolvedValue([
      {
        id: "ship-1",
        status: "in_transit",
        carrier: "DPD",
        carrier_tracking_ref: "TRK-001",
        updated_at: new Date(Date.now() - 30 * 3_600_000),
        order: {
          id: "ord-1",
          erp_order_ref: "ERP-001",
          project: { id: "proj-1", customer_id: "CLI-001" },
        },
      },
    ]);
    const results = await ano21.evaluate();
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe(RULE_IDS.ANO_21);
    expect(results[0].recipients[0].role).toBe("ops");
  });

  it("deduplicates by project", async () => {
    mockPrisma.shipment.findMany.mockResolvedValue([
      {
        id: "ship-1",
        status: "in_transit",
        carrier: "DPD",
        carrier_tracking_ref: "TRK-001",
        updated_at: new Date(Date.now() - 30 * 3_600_000),
        order: {
          id: "ord-1",
          erp_order_ref: "ERP-001",
          project: { id: "proj-1", customer_id: "CLI-001" },
        },
      },
      {
        id: "ship-2",
        status: "dispatched",
        carrier: "DPD",
        carrier_tracking_ref: "TRK-002",
        updated_at: new Date(Date.now() - 28 * 3_600_000),
        order: {
          id: "ord-2",
          erp_order_ref: "ERP-002",
          project: { id: "proj-1", customer_id: "CLI-001" },
        },
      },
    ]);
    const results = await ano21.evaluate();
    expect(results).toHaveLength(1); // deduplicated
  });

  it("returns empty when no stale shipments", async () => {
    mockPrisma.shipment.findMany.mockResolvedValue([]);
    const results = await ano21.evaluate();
    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// Structure des exports
// =============================================================================
describe("Scheduled rules exports", () => {
  it("HOURLY_RULES has 5 rules", () => {
    expect(HOURLY_RULES).toHaveLength(5);
  });

  it("DAILY_RULES has 3 rules", () => {
    expect(DAILY_RULES).toHaveLength(3);
  });

  it("all rules have required properties", () => {
    for (const rule of [...HOURLY_RULES, ...DAILY_RULES]) {
      expect(rule.ruleId).toBeDefined();
      expect(rule.name).toBeDefined();
      expect(["hourly", "daily"]).toContain(rule.frequency);
      expect(typeof rule.evaluate).toBe("function");
    }
  });
});
