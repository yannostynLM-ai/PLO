import { vi, beforeEach, describe, it, expect } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    notification: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { prisma } from "../lib/prisma.js";
import { createCrmTicketForNotification } from "./crm-ticket.service.js";

const mockUpdate = prisma.notification.update as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCrmTicketForNotification", () => {
  it("updates notification with a CRM-prefixed ticket ref", async () => {
    await createCrmTicketForNotification("notif-1", "proj-1", "rule-1", "Test subject");

    expect(mockUpdate).toHaveBeenCalledOnce();
    const call = mockUpdate.mock.calls[0][0];
    expect(call.where.id).toBe("notif-1");
    expect(call.data.crm_ticket_ref).toMatch(/^CRM-/);
  });

  it("returns the generated ticket reference string", async () => {
    const ref = await createCrmTicketForNotification("notif-1", "proj-1", "rule-1", "Test");

    expect(ref).toMatch(/^CRM-\d+-[0-9A-F]{4}$/);
  });

  it("logs ticket creation to console", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await createCrmTicketForNotification("notif-1", "proj-1", "rule-1", "ETA dépassée");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("[CRM]");
    expect(spy.mock.calls[0][0]).toContain("proj-1");
    expect(spy.mock.calls[0][0]).toContain("rule-1");

    spy.mockRestore();
  });
});
