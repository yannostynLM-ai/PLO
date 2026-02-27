import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Mocks — MUST be declared before any server import
// ---------------------------------------------------------------------------

const mockPrisma = {
  project: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  order: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  notification: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  anomalyRule: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  consolidation: { findUnique: vi.fn(), update: vi.fn() },
  projectNote: { create: vi.fn() },
  activityLog: { create: vi.fn() },
  event: { update: vi.fn() },
};

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../lib/activity.js", () => ({ logActivity: vi.fn() }));
vi.mock("../lib/redis.js", () => ({ redis: { quit: vi.fn() } }));
vi.mock("../lib/queue.js", () => ({
  eventQueue: { add: vi.fn(), close: vi.fn() },
  deadLetterQueue: { add: vi.fn(), close: vi.fn() },
}));

import { logActivity } from "../lib/activity.js";
const mockLogActivity = logActivity as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Server + JWT cookies
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  const { buildServer } = await import("../server.js");
  app = await buildServer();
  await app.ready();
  cookie = `plo_session=${app.jwt.sign({ id: "user-1", email: "admin@plo.local", name: "Admin", role: "admin" })}`;
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Projects route", () => {
  // ========================================================================
  // POST /api/projects
  // ========================================================================

  describe("POST /api/projects", () => {
    it("creates a project with valid body and returns 201", async () => {
      const fakeProject = {
        id: "proj-1",
        customer_id: "CUST-001",
        project_type: "kitchen",
        channel_origin: "store",
        status: "draft",
        tracking_token: "tok-abc",
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPrisma.project.create.mockResolvedValue(fakeProject);

      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { cookie },
        payload: {
          customer_id: "CUST-001",
          project_type: "kitchen",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.project).toBeDefined();
      expect(body.project.id).toBe("proj-1");
      expect(mockPrisma.project.create).toHaveBeenCalledOnce();
    });

    it("returns 422 when customer_id is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { cookie },
        payload: {
          project_type: "kitchen",
        },
      });

      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error).toBe("Unprocessable Entity");
      expect(mockPrisma.project.create).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // GET /api/projects
  // ========================================================================

  describe("GET /api/projects", () => {
    const buildFakeProjectRow = (overrides: Record<string, unknown> = {}) => ({
      id: "proj-1",
      customer_id: "CUST-001",
      project_type: "kitchen",
      status: "active",
      channel_origin: "store",
      store_id: "STORE-A",
      assigned_to: null,
      created_at: new Date("2025-10-01"),
      updated_at: new Date("2025-10-02"),
      notifications: [],
      events: [],
      ...overrides,
    });

    it("returns 200 with projects array, total, and page", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        buildFakeProjectRow(),
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/projects",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.projects)).toBe(true);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.projects[0].project_id).toBe("proj-1");
      expect(body.projects[0].anomaly_severity).toBe("ok");
    });

    it("passes status filter to prisma where clause", async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/projects?status=active",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const callArgs = mockPrisma.project.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe("active");
    });

    it("filters by calculated severity=critical client-side", async () => {
      const criticalProject = buildFakeProjectRow({
        notifications: [
          {
            status: "sent",
            sent_at: new Date(),
            rule: { severity: "critical" },
            event: { acknowledged_by: null, created_at: new Date() },
          },
        ],
      });
      const okProject = buildFakeProjectRow({
        id: "proj-2",
        customer_id: "CUST-002",
        notifications: [],
      });

      mockPrisma.project.findMany.mockResolvedValue([criticalProject, okProject]);

      const res = await app.inject({
        method: "GET",
        url: "/api/projects?severity=critical",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Only the critical-severity project should survive the filter
      expect(body.projects.length).toBe(1);
      expect(body.projects[0].anomaly_severity).toBe("critical");
    });
  });

  // ========================================================================
  // GET /api/projects/export.csv
  // ========================================================================

  describe("GET /api/projects/export.csv", () => {
    it("returns 200 with Content-Type text/csv", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        {
          id: "proj-1",
          customer_id: "CUST-001",
          project_type: "kitchen",
          status: "active",
          channel_origin: "store",
          store_id: "S1",
          assigned_to: null,
          created_at: new Date("2025-10-01"),
          updated_at: new Date("2025-10-02"),
          notifications: [],
          events: [],
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/projects/export.csv",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      // First line should be the CSV header
      const lines = res.body.split("\n");
      expect(lines[0]).toContain("Client");
    });
  });

  // ========================================================================
  // GET /api/projects/:id
  // ========================================================================

  describe("GET /api/projects/:id", () => {
    it("returns 200 with project detail", async () => {
      const fakeProject = {
        id: "proj-1",
        customer_id: "CUST-001",
        project_type: "kitchen",
        status: "active",
        external_refs: [],
        orders: [],
        consolidation: null,
        last_mile: null,
        installation: null,
        steps: [],
        events: [],
        notifications: [],
        notes: [],
      };
      mockPrisma.project.findUnique.mockResolvedValue(fakeProject);

      const res = await app.inject({
        method: "GET",
        url: "/api/projects/proj-1",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.project.id).toBe("proj-1");
    });

    it("returns 404 for unknown project id", async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: "/api/projects/unknown-id",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
    });
  });

  // ========================================================================
  // PATCH /api/projects/:id
  // ========================================================================

  describe("PATCH /api/projects/:id", () => {
    it("returns 200 with updated project", async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: "proj-1",
        status: "draft",
        customer_id: "CUST-001",
        assigned_to: null,
      });
      const updatedProject = {
        id: "proj-1",
        status: "active",
        store_id: "STORE-B",
        assigned_to: null,
        updated_at: new Date(),
      };
      mockPrisma.project.update.mockResolvedValue(updatedProject);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/projects/proj-1",
        headers: { cookie },
        payload: { status: "active" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().project.status).toBe("active");
      expect(mockPrisma.project.update).toHaveBeenCalledOnce();
    });

    it("returns 404 for unknown project", async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/projects/unknown-id",
        headers: { cookie },
        payload: { status: "active" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
      expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });

    it("returns 422 when body contains invalid field values", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/projects/proj-1",
        headers: { cookie },
        payload: { status: 123 }, // status must be a string
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe("Unprocessable Entity");
      expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.project.update).not.toHaveBeenCalled();
    });

    it("logs activity when assigned_to changes", async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: "proj-1",
        status: "active",
        customer_id: "CUST-001",
        assigned_to: null,
      });
      mockPrisma.project.update.mockResolvedValue({
        id: "proj-1",
        status: "active",
        store_id: "S1",
        assigned_to: "user-2",
        updated_at: new Date(),
      });

      const res = await app.inject({
        method: "PATCH",
        url: "/api/projects/proj-1",
        headers: { cookie },
        payload: { assigned_to: "user-2" },
      });

      expect(res.statusCode).toBe(200);
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "project_assigned",
          entity_type: "project",
          entity_id: "proj-1",
        }),
      );
    });
  });

  // ========================================================================
  // POST /api/projects/:id/partial-delivery-approval
  // ========================================================================

  describe("POST /api/projects/:id/partial-delivery-approval", () => {
    it("returns 200 with approved: true", async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "CUST-001" });
      mockPrisma.consolidation.findUnique.mockResolvedValue({
        id: "cons-1",
        partial_delivery_approved: false,
      });
      mockPrisma.consolidation.update.mockResolvedValue({
        id: "cons-1",
        status: "partial_approved",
        partial_delivery_approved: true,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/proj-1/partial-delivery-approval",
        headers: { cookie },
        payload: { approved_by: "Admin" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.approved).toBe(true);
      expect(body.consolidation_id).toBe("cons-1");
      expect(mockPrisma.consolidation.update).toHaveBeenCalledOnce();
    });

    it("returns 409 when already approved", async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "CUST-001" });
      mockPrisma.consolidation.findUnique.mockResolvedValue({
        id: "cons-1",
        partial_delivery_approved: true,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/proj-1/partial-delivery-approval",
        headers: { cookie },
        payload: { approved_by: "Admin" },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("Conflict");
      expect(mockPrisma.consolidation.update).not.toHaveBeenCalled();
    });

    it("returns 404 for unknown project", async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      mockPrisma.consolidation.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/unknown-id/partial-delivery-approval",
        headers: { cookie },
        payload: { approved_by: "Admin" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
    });

    it("returns 404 when project exists but has no consolidation", async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ customer_id: "CUST-001" });
      mockPrisma.consolidation.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/proj-1/partial-delivery-approval",
        headers: { cookie },
        payload: { approved_by: "Admin" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toContain("consolidation");
      expect(mockPrisma.consolidation.update).not.toHaveBeenCalled();
    });

    it("returns 422 when approved_by is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/proj-1/partial-delivery-approval",
        headers: { cookie },
        payload: {},
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe("Unprocessable Entity");
    });
  });

  // ========================================================================
  // POST /api/projects/:id/notes
  // ========================================================================

  describe("POST /api/projects/:id/notes", () => {
    it("returns 201 and creates a note with valid payload", async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        id: "proj-1",
        customer_id: "CUST-001",
      });
      mockPrisma.projectNote.create.mockResolvedValueOnce({
        id: "note-1",
        content: "Test note",
        author_name: "Admin",
        project_id: "proj-1",
        created_at: new Date(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/proj-1/notes",
        headers: { cookie },
        payload: { content: "Test note", author_name: "Admin" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.note).toBeDefined();
      expect(body.note.id).toBe("note-1");
      expect(mockPrisma.projectNote.create).toHaveBeenCalledOnce();
    });

    it("returns 404 when project is not found", async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/unknown-id/notes",
        headers: { cookie },
        payload: { content: "Test note", author_name: "Admin" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
      expect(mockPrisma.projectNote.create).not.toHaveBeenCalled();
    });

    it("returns 422 when content is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/proj-1/notes",
        headers: { cookie },
        payload: { author_name: "Admin" },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe("Unprocessable Entity");
    });

    it("returns 422 when author_name is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/proj-1/notes",
        headers: { cookie },
        payload: { content: "Some note" },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe("Unprocessable Entity");
    });
  });

  // ========================================================================
  // Authentication guard
  // ========================================================================

  describe("Authentication", () => {
    it("returns 401 when no JWT cookie is provided", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/projects",
        // No cookie header
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Unauthorized");
    });
  });
});
