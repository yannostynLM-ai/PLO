import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import of the module under test
// ---------------------------------------------------------------------------

// Capture callbacks registered via cron.schedule
const scheduledCallbacks: Array<{
  expression: string;
  callback: () => Promise<void>;
}> = [];

vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(
      (expression: string, callback: () => Promise<void>) => {
        scheduledCallbacks.push({ expression, callback });
      },
    ),
  },
}));

vi.mock("./engine.js", () => ({
  evaluateScheduledRules: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/escalation.service.js", () => ({
  runEscalationCheck: vi.fn().mockResolvedValue(undefined),
}));

// Suppress console output during tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

import cron from "node-cron";
import { evaluateScheduledRules } from "./engine.js";
import { runEscalationCheck } from "../services/escalation.service.js";
import { startCron } from "./cron.js";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  scheduledCallbacks.length = 0;
});

describe("startCron", () => {
  it("registers 3 cron schedules with the correct expressions", () => {
    startCron();

    expect(cron.schedule).toHaveBeenCalledTimes(3);

    const expressions = scheduledCallbacks.map((cb) => cb.expression);
    expect(expressions).toContain("0 * * * *");
    expect(expressions).toContain("0 9 * * *");
    expect(expressions).toContain("*/30 * * * *");
  });

  it("hourly callback calls evaluateScheduledRules with 'hourly'", async () => {
    startCron();

    const hourly = scheduledCallbacks.find(
      (cb) => cb.expression === "0 * * * *",
    );
    expect(hourly).toBeDefined();

    await hourly!.callback();

    expect(evaluateScheduledRules).toHaveBeenCalledOnce();
    expect(evaluateScheduledRules).toHaveBeenCalledWith("hourly");
  });

  it("daily callback calls evaluateScheduledRules with 'daily'", async () => {
    startCron();

    const daily = scheduledCallbacks.find(
      (cb) => cb.expression === "0 9 * * *",
    );
    expect(daily).toBeDefined();

    await daily!.callback();

    expect(evaluateScheduledRules).toHaveBeenCalledOnce();
    expect(evaluateScheduledRules).toHaveBeenCalledWith("daily");
  });

  it("escalation callback calls runEscalationCheck", async () => {
    startCron();

    const escalation = scheduledCallbacks.find(
      (cb) => cb.expression === "*/30 * * * *",
    );
    expect(escalation).toBeDefined();

    await escalation!.callback();

    expect(runEscalationCheck).toHaveBeenCalledOnce();
  });
});
