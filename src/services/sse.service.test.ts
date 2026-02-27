import { vi, beforeEach, describe, it, expect } from "vitest";
import type { ServerResponse } from "http";
import {
  registerSseClient,
  unregisterSseClient,
  broadcastNotification,
  type SseNotificationPayload,
} from "./sse.service.js";

function createMockRes(): ServerResponse {
  return { write: vi.fn() } as unknown as ServerResponse;
}

const samplePayload: SseNotificationPayload = {
  id: "notif-1",
  project_id: "proj-1",
  rule_name: "ANO-16",
  severity: "critical",
  project_customer_id: "CLI-001",
  project_type: "kitchen",
  sent_at: "2026-02-26T10:00:00Z",
};

// Clean the module-level Map between tests by unregistering known IDs
beforeEach(() => {
  unregisterSseClient("client-1");
  unregisterSseClient("client-2");
  unregisterSseClient("client-3");
});

describe("registerSseClient", () => {
  it("adds a client that receives broadcasts", () => {
    const res = createMockRes();
    registerSseClient("client-1", res, "user-1");
    broadcastNotification(samplePayload);
    expect(res.write).toHaveBeenCalledOnce();
  });
});

describe("unregisterSseClient", () => {
  it("removes a client so it no longer receives broadcasts", () => {
    const res = createMockRes();
    registerSseClient("client-1", res, "user-1");
    unregisterSseClient("client-1");
    broadcastNotification(samplePayload);
    expect(res.write).not.toHaveBeenCalled();
  });

  it("does nothing for unknown client id", () => {
    expect(() => unregisterSseClient("unknown-id")).not.toThrow();
  });
});

describe("broadcastNotification", () => {
  it("writes SSE-formatted data to all registered clients", () => {
    const res1 = createMockRes();
    const res2 = createMockRes();
    registerSseClient("client-1", res1, "user-1");
    registerSseClient("client-2", res2, "user-2");

    broadcastNotification(samplePayload);

    const expected = `data: ${JSON.stringify(samplePayload)}\n\n`;
    expect(res1.write).toHaveBeenCalledWith(expected);
    expect(res2.write).toHaveBeenCalledWith(expected);
  });

  it("removes clients that throw on write", () => {
    const goodRes = createMockRes();
    const badRes = createMockRes();
    (badRes.write as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Connection closed");
    });

    registerSseClient("client-1", goodRes, "user-1");
    registerSseClient("client-2", badRes, "user-2");

    broadcastNotification(samplePayload);

    // Good client still received the message
    expect(goodRes.write).toHaveBeenCalledOnce();

    // Second broadcast should only reach good client (bad was removed)
    broadcastNotification(samplePayload);
    expect(goodRes.write).toHaveBeenCalledTimes(2);
    expect(badRes.write).toHaveBeenCalledTimes(1); // only the first failed call
  });

  it("handles empty client registry gracefully", () => {
    expect(() => broadcastNotification(samplePayload)).not.toThrow();
  });
});
