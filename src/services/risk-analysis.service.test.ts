import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks — declared before any import of the modules under test
// =============================================================================

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    project: { findUnique: vi.fn(), count: vi.fn() },
    notification: { count: vi.fn() },
  },
}));

vi.mock("../config.js", () => ({
  config: { ANTHROPIC_API_KEY: "" },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(),
}));

// =============================================================================
// Imports — after vi.mock declarations
// =============================================================================

import { analyzeProjectRisk } from "./risk-analysis.service.js";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import Anthropic from "@anthropic-ai/sdk";

// =============================================================================
// Typed helpers for mocked functions
// =============================================================================

const mockFindUnique = prisma.project.findUnique as ReturnType<typeof vi.fn>;
const mockProjectCount = prisma.project.count as ReturnType<typeof vi.fn>;
const mockNotifCount = prisma.notification.count as ReturnType<typeof vi.fn>;
const MockAnthropic = Anthropic as unknown as ReturnType<typeof vi.fn>;

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "proj-1",
    project_type: "kitchen",
    channel_origin: "store",
    status: "active",
    created_at: new Date("2025-12-01"),
    orders: [],
    consolidation: null,
    last_mile: null,
    installation: null,
    notifications: [],
    steps: [],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("analyzeProjectRisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectCount.mockResolvedValue(100);
    mockNotifCount.mockResolvedValue(50);
    // Ensure API key is empty for heuristic fallback by default
    (config as Record<string, unknown>).ANTHROPIC_API_KEY = "";
  });

  // --------------------------------------------------------------------------
  // 1. Returns null when project not found
  // --------------------------------------------------------------------------
  it("returns null when project not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await analyzeProjectRisk("proj-not-found");

    expect(result).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 2. Returns low risk for healthy project
  // --------------------------------------------------------------------------
  it("returns low risk for healthy project", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    mockFindUnique.mockResolvedValue(
      makeProject({
        id: "proj-healthy",
        created_at: recentDate,
        orders: [],
        notifications: [],
        steps: [],
      }),
    );

    const result = await analyzeProjectRisk("proj-healthy");

    expect(result).not.toBeNull();
    expect(result!.risk_score).toBe(0);
    expect(result!.level).toBe("low");
    expect(result!.cached).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 3. Returns high risk with critical anomalies
  // --------------------------------------------------------------------------
  it("returns high risk with critical anomalies", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    mockFindUnique.mockResolvedValue(
      makeProject({
        id: "proj-critical",
        created_at: recentDate,
        notifications: [
          { id: "n1", status: "sent", rule: { severity: "critical", name: "R1" } },
          { id: "n2", status: "sent", rule: { severity: "critical", name: "R2" } },
          { id: "n3", status: "sent", rule: { severity: "critical", name: "R3" } },
        ],
      }),
    );

    const result = await analyzeProjectRisk("proj-critical");

    expect(result).not.toBeNull();
    // 3 critical * 15 = 45, capped at min(30, 45) = 30
    expect(result!.risk_score).toBe(30);
    expect(result!.level).toBe("medium");
    expect(result!.factors.some((f) => f.factor === "Anomalies critiques")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 4. Detects shortage risk factor
  // --------------------------------------------------------------------------
  it("detects shortage risk factor", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    mockFindUnique.mockResolvedValue(
      makeProject({
        id: "proj-shortage",
        created_at: recentDate,
        orders: [
          {
            id: "o1",
            status: "confirmed",
            promised_delivery_date: null,
            lines: [
              { id: "l1", stock_status: "shortage" },
              { id: "l2", stock_status: "available" },
            ],
            shipments: [],
            steps: [],
          },
        ],
      }),
    );

    const result = await analyzeProjectRisk("proj-shortage");

    expect(result).not.toBeNull();
    expect(result!.factors.some((f) => f.factor === "Ruptures de stock")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 5. Detects late shipments
  // --------------------------------------------------------------------------
  it("detects late shipments", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);

    const promisedDate = new Date();
    promisedDate.setDate(promisedDate.getDate() - 5);

    const estimatedArrival = new Date();
    estimatedArrival.setDate(estimatedArrival.getDate() + 5);

    mockFindUnique.mockResolvedValue(
      makeProject({
        id: "proj-late",
        created_at: recentDate,
        orders: [
          {
            id: "o1",
            status: "confirmed",
            promised_delivery_date: promisedDate,
            lines: [],
            shipments: [
              {
                id: "s1",
                status: "in_transit",
                estimated_arrival: estimatedArrival,
              },
            ],
            steps: [],
          },
        ],
      }),
    );

    const result = await analyzeProjectRisk("proj-late");

    expect(result).not.toBeNull();
    expect(result!.factors.some((f) => f.factor === "Expéditions en retard")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 6. Detects incomplete consolidation
  // --------------------------------------------------------------------------
  it("detects incomplete consolidation", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    mockFindUnique.mockResolvedValue(
      makeProject({
        id: "proj-consol",
        created_at: recentDate,
        consolidation: {
          status: "waiting",
          orders_arrived: ["o1"],
          orders_required: ["o1", "o2", "o3", "o4"],
        },
      }),
    );

    const result = await analyzeProjectRisk("proj-consol");

    expect(result).not.toBeNull();
    expect(result!.factors.some((f) => f.factor === "Consolidation incomplète")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 7. Detects old project
  // --------------------------------------------------------------------------
  it("detects old project", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 90);
    mockFindUnique.mockResolvedValue(
      makeProject({
        id: "proj-old",
        created_at: oldDate,
      }),
    );

    const result = await analyzeProjectRisk("proj-old");

    expect(result).not.toBeNull();
    expect(result!.factors.some((f) => f.factor === "Dossier ancien")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 8. Detects warning anomalies
  // --------------------------------------------------------------------------
  it("detects warning anomalies", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    mockFindUnique.mockResolvedValue(
      makeProject({
        id: "proj-warnings",
        created_at: recentDate,
        notifications: [
          { id: "n1", status: "sent", rule: { severity: "warning", name: "W1" } },
          { id: "n2", status: "sent", rule: { severity: "warning", name: "W2" } },
        ],
      }),
    );

    const result = await analyzeProjectRisk("proj-warnings");

    expect(result).not.toBeNull();
    expect(result!.factors.some((f) => f.factor === "Anomalies warning")).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 9. Returns cached result within TTL
  // --------------------------------------------------------------------------
  it("returns cached result within TTL", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    mockFindUnique.mockResolvedValue(
      makeProject({
        id: "proj-cache",
        created_at: recentDate,
      }),
    );

    const first = await analyzeProjectRisk("proj-cache");
    expect(first).not.toBeNull();
    expect(first!.cached).toBe(false);

    const second = await analyzeProjectRisk("proj-cache");
    expect(second).not.toBeNull();
    expect(second!.cached).toBe(true);

    // findUnique should only be called once for "proj-cache" — second call uses cache
    const findUniqueCalls = mockFindUnique.mock.calls.filter(
      (call: unknown[]) =>
        (call[0] as Record<string, Record<string, string>>).where.id === "proj-cache",
    );
    expect(findUniqueCalls).toHaveLength(1);
  });

  // --------------------------------------------------------------------------
  // 10. Calls Anthropic API when key is set
  // --------------------------------------------------------------------------
  it("calls Anthropic API when key is set", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    mockFindUnique.mockResolvedValue(
      makeProject({
        id: "proj-api",
        created_at: recentDate,
      }),
    );

    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            risk_score: 55,
            level: "high",
            summary: "Risque élevé détecté par l'IA.",
            factors: [{ factor: "Test", impact: "high", detail: "Détail test." }],
            recommendation: "Action recommandée.",
          }),
        },
      ],
    });
    MockAnthropic.mockImplementation(function () {
      return { messages: { create: mockCreate } };
    });

    (config as Record<string, unknown>).ANTHROPIC_API_KEY = "test-key";

    const result = await analyzeProjectRisk("proj-api");

    expect(result).not.toBeNull();
    expect(MockAnthropic).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result!.risk_score).toBe(55);
    expect(result!.level).toBe("high");

    (config as Record<string, unknown>).ANTHROPIC_API_KEY = "";
  });

  // --------------------------------------------------------------------------
  // 11. Falls back to heuristic on API error
  // --------------------------------------------------------------------------
  it("falls back to heuristic on API error", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    mockFindUnique.mockResolvedValue(
      makeProject({
        id: "proj-api-fail",
        created_at: recentDate,
      }),
    );

    MockAnthropic.mockImplementation(function () {
      return {
        messages: {
          create: vi.fn().mockRejectedValue(new Error("API rate limit")),
        },
      };
    });

    (config as Record<string, unknown>).ANTHROPIC_API_KEY = "test-key-fail";

    const result = await analyzeProjectRisk("proj-api-fail");

    expect(result).not.toBeNull();
    expect(result!.risk_score).toBeGreaterThanOrEqual(0);
    expect(result!.level).toBeDefined();
    expect(result!.cached).toBe(false);

    (config as Record<string, unknown>).ANTHROPIC_API_KEY = "";
  });

  // --------------------------------------------------------------------------
  // 12. Clamps risk_score between 0-100
  // --------------------------------------------------------------------------
  it("clamps risk_score between 0-100", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 90);
    mockFindUnique.mockResolvedValue(
      makeProject({
        id: "proj-clamp",
        created_at: recentDate,
        notifications: Array.from({ length: 10 }, (_, i) => ({
          id: `n${i}`,
          status: "sent",
          rule: { severity: "critical", name: `R${i}` },
        })),
        orders: [
          {
            id: "o1",
            status: "confirmed",
            promised_delivery_date: new Date("2025-01-01"),
            lines: Array.from({ length: 5 }, (_, i) => ({
              id: `l${i}`,
              stock_status: "shortage",
            })),
            shipments: Array.from({ length: 3 }, (_, i) => ({
              id: `s${i}`,
              status: "in_transit",
              estimated_arrival: new Date("2026-06-01"),
            })),
            steps: [],
          },
        ],
        consolidation: {
          status: "waiting",
          orders_arrived: [],
          orders_required: ["o1", "o2", "o3", "o4"],
        },
      }),
    );

    const result = await analyzeProjectRisk("proj-clamp");

    expect(result).not.toBeNull();
    expect(result!.risk_score).toBeLessThanOrEqual(100);
    expect(result!.risk_score).toBeGreaterThanOrEqual(0);
    expect(result!.level).toBe("critical");
  });
});
