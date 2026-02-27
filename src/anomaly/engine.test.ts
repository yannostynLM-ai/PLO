import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks — declared before any import of the modules under test
// =============================================================================

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    event: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    order: { findUnique: vi.fn() },
    installation: { findUnique: vi.fn() },
  },
}));

vi.mock("./rules/realtime.rules.js", () => ({
  REALTIME_RULES: [
    {
      ruleId: "ANO-TEST",
      name: "Test rule",
      triggers: ["order.confirmed"],
      evaluate: vi.fn(),
    },
  ],
}));

vi.mock("./rules/scheduled.rules.js", () => ({
  HOURLY_RULES: [
    {
      ruleId: "SCH-TEST",
      name: "Scheduled test",
      frequency: "hourly" as const,
      evaluate: vi.fn(),
    },
  ],
  DAILY_RULES: [],
}));

vi.mock("../services/notification.service.js", () => ({
  handleRuleResult: vi.fn(),
  handleScheduledRuleResult: vi.fn(),
}));

// =============================================================================
// Imports — after vi.mock declarations
// =============================================================================

import { prisma } from "../lib/prisma.js";
import { REALTIME_RULES } from "./rules/realtime.rules.js";
import { HOURLY_RULES } from "./rules/scheduled.rules.js";
import {
  handleRuleResult,
  handleScheduledRuleResult,
} from "../services/notification.service.js";
import { evaluateRealTimeRules, evaluateScheduledRules } from "./engine.js";

// =============================================================================
// Typed helpers for mocked functions
// =============================================================================

const mockEventFindUnique = prisma.event.findUnique as ReturnType<typeof vi.fn>;
const mockProjectFindUnique = prisma.project.findUnique as ReturnType<typeof vi.fn>;
const mockHandleRuleResult = handleRuleResult as ReturnType<typeof vi.fn>;
const mockHandleScheduledRuleResult = handleScheduledRuleResult as ReturnType<typeof vi.fn>;

const mockRule = REALTIME_RULES[0];
const mockScheduledRule = HOURLY_RULES[0];

const fakeEvent = {
  id: "evt-1",
  event_type: "order.confirmed",
  project_id: "proj-1",
};

const fakeProject = {
  id: "proj-1",
  consolidation: null,
  last_mile: null,
  installation: null,
  orders: [],
};

const baseParams = {
  eventId: "evt-1",
  projectId: "proj-1",
  orderId: null,
  installationId: null,
  eventType: "order.confirmed",
};

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  (mockRule.evaluate as ReturnType<typeof vi.fn>).mockReset();
  (mockScheduledRule.evaluate as ReturnType<typeof vi.fn>).mockReset();
});

// =============================================================================
// evaluateRealTimeRules
// =============================================================================

describe("evaluateRealTimeRules", () => {
  // --------------------------------------------------------------------------
  // 1. Skips when no rules match eventType
  // --------------------------------------------------------------------------
  it("skips when no rules match eventType", async () => {
    await evaluateRealTimeRules({
      ...baseParams,
      eventType: "unknown.event",
    });

    expect(mockEventFindUnique).not.toHaveBeenCalled();
    expect(mockHandleRuleResult).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 2. Evaluates matching rule and handles result
  // --------------------------------------------------------------------------
  it("evaluates matching rule and handles result", async () => {
    mockEventFindUnique.mockResolvedValue(fakeEvent);
    mockProjectFindUnique.mockResolvedValue(fakeProject);

    const ruleResult = {
      ruleId: "ANO-TEST",
      projectId: "proj-1",
      orderId: null,
      installationId: null,
      eventId: "evt-1",
      recipients: [{ email: "test@example.com", role: "coordinateur" }],
      subject: "Test anomaly",
      bodyHtml: "<p>Anomaly</p>",
      bodyText: "Anomaly",
    };
    (mockRule.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(ruleResult);

    await evaluateRealTimeRules(baseParams);

    expect(mockRule.evaluate).toHaveBeenCalledOnce();
    expect(mockHandleRuleResult).toHaveBeenCalledOnce();
    expect(mockHandleRuleResult).toHaveBeenCalledWith(ruleResult);
  });

  // --------------------------------------------------------------------------
  // 3. Skips rule when evaluate returns null
  // --------------------------------------------------------------------------
  it("skips rule when evaluate returns null", async () => {
    mockEventFindUnique.mockResolvedValue(fakeEvent);
    mockProjectFindUnique.mockResolvedValue(fakeProject);
    (mockRule.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await evaluateRealTimeRules(baseParams);

    expect(mockRule.evaluate).toHaveBeenCalledOnce();
    expect(mockHandleRuleResult).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 4. Catches error from rule evaluate without throwing
  // --------------------------------------------------------------------------
  it("catches error from rule evaluate without throwing", async () => {
    mockEventFindUnique.mockResolvedValue(fakeEvent);
    mockProjectFindUnique.mockResolvedValue(fakeProject);
    (mockRule.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Rule evaluation failed"),
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(evaluateRealTimeRules(baseParams)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    expect(mockHandleRuleResult).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // --------------------------------------------------------------------------
  // 5. Does nothing when context is null (event not found)
  // --------------------------------------------------------------------------
  it("does nothing when context is null (event not found)", async () => {
    mockEventFindUnique.mockResolvedValue(null);

    await evaluateRealTimeRules(baseParams);

    expect(mockRule.evaluate).not.toHaveBeenCalled();
    expect(mockHandleRuleResult).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 6. Loads order from DB when orderId is provided
  // --------------------------------------------------------------------------
  it("loads order from DB when orderId is provided", async () => {
    mockEventFindUnique.mockResolvedValue(fakeEvent);
    mockProjectFindUnique.mockResolvedValue(fakeProject);
    const mockOrderFindUnique = prisma.order.findUnique as ReturnType<typeof vi.fn>;
    mockOrderFindUnique.mockResolvedValue({ id: "ord-1", status: "confirmed" });
    (mockRule.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await evaluateRealTimeRules({
      ...baseParams,
      orderId: "ord-1",
    });

    expect(mockOrderFindUnique).toHaveBeenCalledWith({ where: { id: "ord-1" } });
    expect(mockRule.evaluate).toHaveBeenCalledOnce();
  });

  // --------------------------------------------------------------------------
  // 7. Loads installation from DB when installationId is provided
  // --------------------------------------------------------------------------
  it("loads installation from DB when installationId is provided", async () => {
    mockEventFindUnique.mockResolvedValue(fakeEvent);
    mockProjectFindUnique.mockResolvedValue(fakeProject);
    const mockInstallationFindUnique = prisma.installation.findUnique as ReturnType<typeof vi.fn>;
    mockInstallationFindUnique.mockResolvedValue({ id: "inst-1", status: "scheduled" });
    (mockRule.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await evaluateRealTimeRules({
      ...baseParams,
      installationId: "inst-1",
    });

    expect(mockInstallationFindUnique).toHaveBeenCalledWith({ where: { id: "inst-1" } });
    expect(mockRule.evaluate).toHaveBeenCalledOnce();
  });
});

// =============================================================================
// evaluateScheduledRules
// =============================================================================

describe("evaluateScheduledRules", () => {
  // --------------------------------------------------------------------------
  // 6. Evaluates hourly rules
  // --------------------------------------------------------------------------
  it("evaluates hourly rules", async () => {
    const results = [
      {
        ruleId: "SCH-TEST",
        projectId: "proj-1",
        orderId: null,
        installationId: null,
        eventId: "cron",
        recipients: [{ email: "ops@example.com", role: "ops" }],
        subject: "Scheduled anomaly",
        bodyHtml: "<p>Scheduled</p>",
        bodyText: "Scheduled",
      },
    ];
    (mockScheduledRule.evaluate as ReturnType<typeof vi.fn>).mockResolvedValue(results);

    await evaluateScheduledRules("hourly");

    expect(mockScheduledRule.evaluate).toHaveBeenCalledOnce();
    expect(mockHandleScheduledRuleResult).toHaveBeenCalledOnce();
    expect(mockHandleScheduledRuleResult).toHaveBeenCalledWith(results[0]);
  });

  // --------------------------------------------------------------------------
  // 7. Evaluates daily rules (empty array)
  // --------------------------------------------------------------------------
  it("evaluates daily rules (empty array)", async () => {
    await evaluateScheduledRules("daily");

    // DAILY_RULES is empty, so no rule evaluation or result handling
    expect(mockScheduledRule.evaluate).not.toHaveBeenCalled();
    expect(mockHandleScheduledRuleResult).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 8. Catches error from scheduled rule evaluate
  // --------------------------------------------------------------------------
  it("catches error from scheduled rule evaluate", async () => {
    (mockScheduledRule.evaluate as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Scheduled rule failed"),
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(evaluateScheduledRules("hourly")).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    expect(mockHandleScheduledRuleResult).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
