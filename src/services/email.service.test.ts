import { vi, describe, it, expect, beforeEach } from "vitest";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("sendEmail", () => {
  it("logs to console and returns true when SMTP_HOST is empty", async () => {
    vi.doMock("nodemailer", () => ({
      default: { createTransport: vi.fn(() => ({ sendMail: vi.fn() })) },
    }));
    vi.doMock("../config.js", () => ({
      config: { SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "", SMTP_FROM: "plo@test.local" },
    }));
    const { sendEmail } = await import("./email.service.js");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendEmail({ to: "user@test.local", subject: "Test", html: "<p>Test</p>", text: "Test" });

    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("Mode console");
  });

  it("sends via nodemailer when SMTP is configured", async () => {
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: "msg-1" });
    vi.doMock("nodemailer", () => ({
      default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
    }));
    vi.doMock("../config.js", () => ({
      config: { SMTP_HOST: "smtp.test.local", SMTP_PORT: 587, SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "plo@test.local" },
    }));
    const { sendEmail } = await import("./email.service.js");

    const result = await sendEmail({ to: "user@test.local", subject: "Subject", html: "<p>Body</p>", text: "Body" });

    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: "plo@test.local",
      to: "user@test.local",
      subject: "Subject",
    }));
  });

  it("returns false and logs error when sendMail rejects", async () => {
    const failMail = vi.fn().mockRejectedValue(new Error("SMTP timeout"));
    vi.doMock("nodemailer", () => ({
      default: { createTransport: vi.fn(() => ({ sendMail: failMail })) },
    }));
    vi.doMock("../config.js", () => ({
      config: { SMTP_HOST: "smtp.fail", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "", SMTP_FROM: "plo@test.local" },
    }));
    const { sendEmail } = await import("./email.service.js");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendEmail({ to: "user@test.local", subject: "Test", html: "<p>Test</p>", text: "Test" });

    expect(result).toBe(false);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("joins array recipients with comma", async () => {
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: "msg-2" });
    vi.doMock("nodemailer", () => ({
      default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
    }));
    vi.doMock("../config.js", () => ({
      config: { SMTP_HOST: "smtp.test.local", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "", SMTP_FROM: "plo@test.local" },
    }));
    const { sendEmail } = await import("./email.service.js");

    await sendEmail({ to: ["a@test.local", "b@test.local"], subject: "Test", html: "<p>Test</p>", text: "Test" });

    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@test.local, b@test.local" }));
  });
});
