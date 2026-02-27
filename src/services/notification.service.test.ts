import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Mocks — must be declared before any import of the modules under test
// =============================================================================

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    notification: {
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "notif-gen-id" }),
      update: vi.fn(),
    },
    anomalyRule: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    step: { update: vi.fn() },
  },
}));

vi.mock("./email.service.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("./crm-ticket.service.js", () => ({
  createCrmTicketForNotification: vi.fn(),
}));

vi.mock("./sse.service.js", () => ({
  broadcastNotification: vi.fn(),
}));

import {
  hasRecentNotification,
  handleRuleResult,
  handleScheduledRuleResult,
} from "./notification.service.js";
import { prisma } from "../lib/prisma.js";
import { sendEmail } from "./email.service.js";
import { createCrmTicketForNotification } from "./crm-ticket.service.js";
import { broadcastNotification } from "./sse.service.js";
import type { RuleResult } from "../anomaly/types.js";

// =============================================================================
// Helpers
// =============================================================================

const mockPrisma = prisma as unknown as {
  notification: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  anomalyRule: { findUnique: ReturnType<typeof vi.fn> };
  project: { findUnique: ReturnType<typeof vi.fn> };
  event: { findUnique: ReturnType<typeof vi.fn> };
  step: { update: ReturnType<typeof vi.fn> };
};

const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;
const mockCreateCrmTicket = createCrmTicketForNotification as ReturnType<typeof vi.fn>;
const mockBroadcast = broadcastNotification as ReturnType<typeof vi.fn>;

function makeRuleResult(overrides: Partial<RuleResult> = {}): RuleResult {
  return {
    ruleId: "rule-1",
    projectId: "proj-1",
    orderId: "order-1",
    installationId: null,
    eventId: "evt-1",
    recipients: [{ email: "alice@example.com", role: "coordinateur" }],
    subject: "Alerte PLO",
    bodyHtml: "<p>Alert</p>",
    bodyText: "Alert",
    ...overrides,
  };
}

// =============================================================================
// Tests unitaires — hasRecentNotification()
// =============================================================================

describe("hasRecentNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when findFirst returns non-null", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({ id: "notif-1" });

    const result = await hasRecentNotification("rule-1", "proj-1");

    expect(result).toBe(true);
    expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rule_id: "rule-1",
          project_id: "proj-1",
          status: "sent",
        }),
      })
    );
  });

  it("returns false when findFirst returns null", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);

    const result = await hasRecentNotification("rule-1", "proj-1");

    expect(result).toBe(false);
  });
});

// =============================================================================
// Tests unitaires — handleRuleResult()
// =============================================================================

describe("handleRuleResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock return values after clearAllMocks
    mockPrisma.notification.create.mockResolvedValue({ id: "notif-gen-id" });
    mockSendEmail.mockResolvedValue(true);
  });

  // --------------------------------------------------------------------------
  // 3. Dedup: skips when hasRecentNotification returns true
  // --------------------------------------------------------------------------
  it("skips when hasRecentNotification returns true (dedup)", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({ id: "recent-notif" });

    await handleRuleResult(makeRuleResult());

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 4. Creates notification per recipient
  // --------------------------------------------------------------------------
  it("creates notification per recipient", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.anomalyRule.findUnique.mockResolvedValue({ severity: "warning", name: "R1" });
    mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "cust-1", project_type: "renovation" });
    mockPrisma.event.findUnique.mockResolvedValue({ step_id: null });

    const result = makeRuleResult({
      recipients: [
        { email: "alice@example.com", role: "coordinateur" },
        { email: "bob@example.com", role: "manager" },
      ],
    });

    await handleRuleResult(result);

    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipient: "alice@example.com" }),
      })
    );
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipient: "bob@example.com" }),
      })
    );
  });

  // --------------------------------------------------------------------------
  // 5. Sends email per recipient
  // --------------------------------------------------------------------------
  it("sends email per recipient", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.anomalyRule.findUnique.mockResolvedValue({ severity: "warning", name: "R1" });
    mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "cust-1", project_type: "renovation" });
    mockPrisma.event.findUnique.mockResolvedValue({ step_id: null });

    const result = makeRuleResult({
      recipients: [
        { email: "alice@example.com", role: "coordinateur" },
        { email: "bob@example.com", role: "manager" },
      ],
    });

    await handleRuleResult(result);

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: "Alerte PLO",
      })
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "bob@example.com",
        subject: "Alerte PLO",
      })
    );
  });

  // --------------------------------------------------------------------------
  // 6. Updates notification status to 'sent' on email success
  // --------------------------------------------------------------------------
  it("updates notification status to 'sent' on email success", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({ id: "notif-ok" });
    mockSendEmail.mockResolvedValue(true);
    mockPrisma.anomalyRule.findUnique.mockResolvedValue({ severity: "info", name: "R1" });
    mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "cust-1", project_type: "renovation" });
    mockPrisma.event.findUnique.mockResolvedValue({ step_id: null });

    await handleRuleResult(makeRuleResult());

    expect(mockPrisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "notif-ok" },
        data: expect.objectContaining({ status: "sent" }),
      })
    );
  });

  // --------------------------------------------------------------------------
  // 7. Updates notification status to 'failed' on email failure
  // --------------------------------------------------------------------------
  it("updates notification status to 'failed' on email failure", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({ id: "notif-fail" });
    mockSendEmail.mockResolvedValue(false);
    mockPrisma.anomalyRule.findUnique.mockResolvedValue({ severity: "info", name: "R1" });
    mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "cust-1", project_type: "renovation" });
    mockPrisma.event.findUnique.mockResolvedValue({ step_id: null });

    await handleRuleResult(makeRuleResult());

    expect(mockPrisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "notif-fail" },
        data: expect.objectContaining({ status: "failed" }),
      })
    );
  });

  // --------------------------------------------------------------------------
  // 8. Creates CRM ticket for critical severity rules
  // --------------------------------------------------------------------------
  it("creates CRM ticket for critical severity rules", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({ id: "notif-critical" });
    mockPrisma.anomalyRule.findUnique.mockResolvedValue({ severity: "critical", name: "R-Critical" });
    mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "cust-1", project_type: "renovation" });
    mockPrisma.event.findUnique.mockResolvedValue({ step_id: null });

    await handleRuleResult(makeRuleResult());

    expect(mockCreateCrmTicket).toHaveBeenCalledOnce();
    expect(mockCreateCrmTicket).toHaveBeenCalledWith(
      "notif-critical",
      "proj-1",
      "rule-1",
      "Alerte PLO"
    );
  });

  // --------------------------------------------------------------------------
  // 9. Does NOT create CRM ticket for warning severity rules
  // --------------------------------------------------------------------------
  it("does NOT create CRM ticket for warning severity rules", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.anomalyRule.findUnique.mockResolvedValue({ severity: "warning", name: "R-Warning" });
    mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "cust-1", project_type: "renovation" });
    mockPrisma.event.findUnique.mockResolvedValue({ step_id: null });

    await handleRuleResult(makeRuleResult());

    expect(mockCreateCrmTicket).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 10. Broadcasts SSE notification
  // --------------------------------------------------------------------------
  it("broadcasts SSE notification", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({ id: "notif-sse" });
    mockPrisma.anomalyRule.findUnique.mockResolvedValue({ severity: "warning", name: "Retard livraison" });
    mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "cust-42", project_type: "neuf" });
    mockPrisma.event.findUnique.mockResolvedValue({ step_id: null });

    await handleRuleResult(makeRuleResult());

    expect(mockBroadcast).toHaveBeenCalledOnce();
    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "notif-sse",
        project_id: "proj-1",
        rule_name: "Retard livraison",
        severity: "warning",
        project_customer_id: "cust-42",
        project_type: "neuf",
      })
    );
  });

  // --------------------------------------------------------------------------
  // 11. Marks event step as anomaly
  // --------------------------------------------------------------------------
  it("marks event step as anomaly", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.anomalyRule.findUnique.mockResolvedValue({ severity: "info", name: "R1" });
    mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "cust-1", project_type: "renovation" });
    mockPrisma.event.findUnique.mockResolvedValue({ step_id: "step-99" });

    await handleRuleResult(makeRuleResult());

    expect(mockPrisma.step.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step-99" },
        data: expect.objectContaining({ status: "anomaly" }),
      })
    );
  });
});

// =============================================================================
// Tests unitaires — handleScheduledRuleResult()
// =============================================================================

describe("handleScheduledRuleResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock return values after clearAllMocks
    mockPrisma.notification.create.mockResolvedValue({ id: "notif-gen-id" });
    mockSendEmail.mockResolvedValue(true);
  });

  it("creates notifications and sends emails", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    mockPrisma.notification.create.mockResolvedValue({ id: "sched-notif-1" });
    mockPrisma.anomalyRule.findUnique.mockResolvedValue({ severity: "warning", name: "Scheduled R" });
    mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "cust-1", project_type: "renovation" });

    const result = makeRuleResult({
      recipients: [
        { email: "alice@example.com", role: "coordinateur" },
        { email: "bob@example.com", role: "ops" },
      ],
    });

    await handleScheduledRuleResult(result);

    // Creates one notification per recipient
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipient: "alice@example.com" }),
      })
    );
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipient: "bob@example.com" }),
      })
    );

    // Sends one email per recipient
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alice@example.com" })
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "bob@example.com" })
    );

    // Updates notification status
    expect(mockPrisma.notification.update).toHaveBeenCalledTimes(2);

    // Broadcasts SSE
    expect(mockBroadcast).toHaveBeenCalledOnce();
  });

  it("returns early when recent notification exists (dedup)", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({ id: "recent-notif" });

    await handleScheduledRuleResult(makeRuleResult());

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
