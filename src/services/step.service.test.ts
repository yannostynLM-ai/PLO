import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — declared before any import that depends on them
// ---------------------------------------------------------------------------

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    step: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Import mocked modules *after* vi.mock declarations
import { prisma } from "../lib/prisma.js";
import { upsertStep } from "./step.service.js";

// Typed helpers for mock functions
const findFirst = prisma.step.findFirst as ReturnType<typeof vi.fn>;
const update = prisma.step.update as ReturnType<typeof vi.fn>;
const create = prisma.step.create as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("upsertStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Returns null for unmapped event_type
  it("returns null for an unmapped event_type", async () => {
    const result = await upsertStep({
      event_type: "some.unknown",
      project_id: "proj-1",
      order_id: null,
      installation_id: null,
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  // 2. Returns null when level=order but order_id is null
  it("returns null when level is order but order_id is null", async () => {
    const result = await upsertStep({
      event_type: "order.confirmed",
      project_id: "proj-1",
      order_id: null,
      installation_id: null,
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  // 3. Returns null when level=installation but installation_id is null
  it("returns null when level is installation but installation_id is null", async () => {
    const result = await upsertStep({
      event_type: "installation.scheduled",
      project_id: "proj-1",
      order_id: "ord-1",
      installation_id: null,
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  // 4. Updates existing step when findFirst returns a match
  it("updates the existing step when findFirst returns a match", async () => {
    const existingStep = {
      id: "step-existing-1",
      step_type: "order_confirmed",
      status: "in_progress",
      completed_at: null,
    };
    findFirst.mockResolvedValueOnce(existingStep);
    update.mockResolvedValueOnce({ ...existingStep, status: "completed" });

    const result = await upsertStep({
      event_type: "order.confirmed",
      project_id: "proj-1",
      order_id: "ord-1",
      installation_id: null,
    });

    expect(result).toBe("step-existing-1");
    expect(findFirst).toHaveBeenCalledWith({
      where: { order_id: "ord-1", step_type: "order_confirmed" },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "step-existing-1" },
      data: expect.objectContaining({
        status: "completed",
        updated_at: expect.any(Date),
      }),
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 5. Sets completed_at when new_status is "completed" on update
  it("sets completed_at when new_status is completed on update", async () => {
    const existingStep = {
      id: "step-100",
      step_type: "inspiration",
      status: "in_progress",
      completed_at: null,
    };
    findFirst.mockResolvedValueOnce(existingStep);
    update.mockResolvedValueOnce({ ...existingStep, status: "completed" });

    await upsertStep({
      event_type: "inspiration.completed",
      project_id: "proj-1",
      order_id: null,
      installation_id: null,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "step-100" },
      data: expect.objectContaining({
        status: "completed",
        completed_at: expect.any(Date),
      }),
    });
  });

  // 6. Preserves existing completed_at when new_status is not "completed"
  it("preserves existing completed_at when new_status is not completed", async () => {
    const previousCompletedAt = new Date("2025-06-01T12:00:00Z");
    const existingStep = {
      id: "step-200",
      step_type: "inspiration",
      status: "completed",
      completed_at: previousCompletedAt,
    };
    findFirst.mockResolvedValueOnce(existingStep);
    update.mockResolvedValueOnce({ ...existingStep, status: "anomaly" });

    await upsertStep({
      event_type: "inspiration.abandoned",
      project_id: "proj-1",
      order_id: null,
      installation_id: null,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "step-200" },
      data: expect.objectContaining({
        status: "anomaly",
        completed_at: previousCompletedAt,
      }),
    });
  });

  // 7. Creates a new step when findFirst returns null
  it("creates a new step when findFirst returns null", async () => {
    findFirst.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({ id: "step-new-1" });

    const result = await upsertStep({
      event_type: "order.confirmed",
      project_id: "proj-1",
      order_id: "ord-1",
      installation_id: null,
    });

    expect(result).toBe("step-new-1");
    expect(findFirst).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        step_type: "order_confirmed",
        status: "completed",
      }),
    });
    expect(update).not.toHaveBeenCalled();
  });

  // 8. Sets project_id correctly for project-level steps
  it("sets project_id for project-level steps", async () => {
    findFirst.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({ id: "step-proj-1" });

    await upsertStep({
      event_type: "inspiration.completed",
      project_id: "proj-42",
      order_id: "ord-7",
      installation_id: "inst-9",
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { project_id: "proj-42", step_type: "inspiration" },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        project_id: "proj-42",
        order_id: null,
        installation_id: null,
      }),
    });
  });

  // 9. Sets order_id correctly for order-level steps
  it("sets order_id for order-level steps", async () => {
    findFirst.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({ id: "step-ord-1" });

    await upsertStep({
      event_type: "order.confirmed",
      project_id: "proj-42",
      order_id: "ord-55",
      installation_id: "inst-9",
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { order_id: "ord-55", step_type: "order_confirmed" },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        project_id: null,
        order_id: "ord-55",
        installation_id: null,
      }),
    });
  });

  // 10. Sets installation_id for installation-level steps
  it("sets installation_id for installation-level steps", async () => {
    findFirst.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({ id: "step-inst-1" });

    await upsertStep({
      event_type: "installation.scheduled",
      project_id: "proj-42",
      order_id: "ord-7",
      installation_id: "inst-88",
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { installation_id: "inst-88", step_type: "installation_scheduled" },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        project_id: null,
        order_id: null,
        installation_id: "inst-88",
      }),
    });
  });
});
