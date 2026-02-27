import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — declared before any import that depends on them
// ---------------------------------------------------------------------------

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    notification: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("./email.service.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("../config.js", () => ({
  config: {
    ESCALATION_HOURS: 4,
    ALERT_EMAILS: { manager: "manager@test.local", ops: "ops@test.local" },
  },
}));

// Import mocked modules *after* vi.mock declarations
import { prisma } from "../lib/prisma.js";
import { sendEmail } from "./email.service.js";
import { runEscalationCheck } from "./escalation.service.js";

// Typed helpers
const findMany = prisma.notification.findMany as ReturnType<typeof vi.fn>;
const notifUpdate = prisma.notification.update as ReturnType<typeof vi.fn>;
const sendEmailMock = sendEmail as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers — build a realistic notification candidate
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "notif-1",
    project_id: "proj-1",
    sent_at: new Date(Date.now() - 5 * 3_600_000), // 5 hours ago
    rule: { name: "Retard picking", severity: "high" },
    project: { id: "proj-1", customer_id: "CUST-001" },
    event: { acknowledged_by: null },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runEscalationCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifUpdate.mockResolvedValue({});
  });

  // 1. Does nothing when no candidates found
  it("does nothing when no candidates are found", async () => {
    findMany.mockResolvedValueOnce([]);

    await runEscalationCheck();

    expect(findMany).toHaveBeenCalledOnce();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(notifUpdate).not.toHaveBeenCalled();
  });

  // 2. Sends escalation email to manager and ops
  it("sends escalation email to manager and ops for unacked notifications", async () => {
    findMany.mockResolvedValueOnce([makeCandidate()]);

    await runEscalationCheck();

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["manager@test.local", "ops@test.local"],
        subject: expect.stringContaining("ESCALADE PLO"),
        html: expect.any(String),
        text: expect.any(String),
      }),
    );
  });

  // 3. Updates notification with escalated_at timestamp
  it("updates notification with escalated_at timestamp", async () => {
    const candidate = makeCandidate({ id: "notif-42" });
    findMany.mockResolvedValueOnce([candidate]);

    await runEscalationCheck();

    expect(notifUpdate).toHaveBeenCalledOnce();
    expect(notifUpdate).toHaveBeenCalledWith({
      where: { id: "notif-42" },
      data: { escalated_at: expect.any(Date) },
    });
  });

  // 4. Handles notification with null sent_at gracefully
  it("handles notification with null sent_at gracefully", async () => {
    const candidate = makeCandidate({ id: "notif-null-sent", sent_at: null });
    findMany.mockResolvedValueOnce([candidate]);

    await runEscalationCheck();

    // Should still send the email and update — the service falls back to
    // "inconnu" for the sent_at display and ESCALATION_HOURS for elapsed time.
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("inconnu"),
      }),
    );
    expect(notifUpdate).toHaveBeenCalledWith({
      where: { id: "notif-null-sent" },
      data: { escalated_at: expect.any(Date) },
    });
  });

  // 5. Processes multiple candidates in sequence
  it("processes multiple candidates in sequence", async () => {
    const candidates = [
      makeCandidate({ id: "notif-a", project: { id: "proj-a", customer_id: "CUST-A" } }),
      makeCandidate({ id: "notif-b", project: { id: "proj-b", customer_id: "CUST-B" } }),
      makeCandidate({ id: "notif-c", project: { id: "proj-c", customer_id: "CUST-C" } }),
    ];
    findMany.mockResolvedValueOnce(candidates);

    await runEscalationCheck();

    // One email + one update per candidate
    expect(sendEmailMock).toHaveBeenCalledTimes(3);
    expect(notifUpdate).toHaveBeenCalledTimes(3);

    // Verify each notification was updated with the correct id
    expect(notifUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "notif-a" } }),
    );
    expect(notifUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "notif-b" } }),
    );
    expect(notifUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "notif-c" } }),
    );
  });
});
