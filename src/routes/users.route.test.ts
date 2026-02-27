import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Mocks — MUST be declared before any server import
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  // Stubs required by other routes registered in buildServer
  notification: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  project: { count: vi.fn(), findMany: vi.fn() },
  event: { update: vi.fn(), updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
  order: { findMany: vi.fn() },
  anomalyRule: { findMany: vi.fn() },
  consolidation: { findUnique: vi.fn() },
};

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../lib/activity.js", () => ({ logActivity: vi.fn() }));
vi.mock("../lib/redis.js", () => ({ redis: { quit: vi.fn() } }));
vi.mock("../lib/queue.js", () => ({
  eventQueue: { add: vi.fn(), close: vi.fn() },
  deadLetterQueue: { add: vi.fn(), close: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Server + JWT cookies
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let cookie: string;
let viewerCookie: string;

beforeAll(async () => {
  const { buildServer } = await import("../server.js");
  app = await buildServer();
  await app.ready();
  cookie = `plo_session=${app.jwt.sign({ id: "user-1", email: "admin@plo.local", name: "Admin", role: "admin" })}`;
  viewerCookie = `plo_session=${app.jwt.sign({ id: "user-2", email: "viewer@plo.local", name: "Viewer", role: "viewer" })}`;
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

describe("Users route", () => {
  // ========================================================================
  // GET /api/users/directory
  // ========================================================================

  describe("GET /api/users/directory", () => {
    it("returns 200 with admin cookie", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "user-1", name: "Admin" },
        { id: "user-2", name: "Viewer" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/users/directory",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.users).toBeDefined();
      expect(Array.isArray(body.users)).toBe(true);
      expect(body.users.length).toBe(2);
      expect(mockPrisma.user.findMany).toHaveBeenCalledOnce();
    });
  });

  // ========================================================================
  // GET /api/users
  // ========================================================================

  describe("GET /api/users", () => {
    it("returns 200 with users array for admin", async () => {
      const fakeUsers = [
        {
          id: "user-1",
          email: "admin@plo.local",
          name: "Admin",
          role: "admin",
          created_at: new Date("2025-01-01"),
          updated_at: new Date("2025-01-02"),
        },
      ];
      mockPrisma.user.findMany.mockResolvedValue(fakeUsers);

      const res = await app.inject({
        method: "GET",
        url: "/api/users",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.users)).toBe(true);
      expect(body.users.length).toBe(1);
      expect(body.users[0].id).toBe("user-1");
      expect(mockPrisma.user.findMany).toHaveBeenCalledOnce();
    });

    it("returns 403 for non-admin (viewer)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/users",
        headers: { cookie: viewerCookie },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("Forbidden");
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it("returns 401 when no JWT cookie is provided", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/users",
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("Unauthorized");
    });
  });

  // ========================================================================
  // POST /api/users
  // ========================================================================

  describe("POST /api/users", () => {
    const validPayload = {
      email: "new@plo.local",
      name: "New User",
      password: "securepass123",
      role: "viewer",
    };

    it("creates a user and returns 201", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const fakeUser = {
        id: "user-new",
        email: "new@plo.local",
        name: "New User",
        role: "viewer",
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPrisma.user.create.mockResolvedValue(fakeUser);

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.user).toBeDefined();
      expect(body.user.id).toBe("user-new");
      expect(body.user.email).toBe("new@plo.local");
      expect(mockPrisma.user.create).toHaveBeenCalledOnce();
    });

    it("returns 422 when email is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: {
          name: "No Email",
          password: "securepass123",
          role: "viewer",
        },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe("Unprocessable Entity");
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it("returns 422 when password is too short", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: {
          email: "short@plo.local",
          name: "Short Pass",
          password: "abc",
          role: "viewer",
        },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe("Unprocessable Entity");
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it("returns 409 when email already exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "existing-user",
        email: "new@plo.local",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: { cookie },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("Conflict");
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // PATCH /api/users/:id
  // ========================================================================

  describe("PATCH /api/users/:id", () => {
    it("returns 200 when updating name", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-99",
        email: "other@plo.local",
        name: "Old Name",
        role: "viewer",
      });
      const updatedUser = {
        id: "user-99",
        email: "other@plo.local",
        name: "New Name",
        role: "viewer",
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/users/user-99",
        headers: { cookie },
        payload: { name: "New Name" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.name).toBe("New Name");
      expect(mockPrisma.user.update).toHaveBeenCalledOnce();
    });

    it("returns 200 when updating role of another user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-99",
        email: "other@plo.local",
        name: "Other",
        role: "viewer",
      });
      const updatedUser = {
        id: "user-99",
        email: "other@plo.local",
        name: "Other",
        role: "coordinator",
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/users/user-99",
        headers: { cookie },
        payload: { role: "coordinator" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user.role).toBe("coordinator");
      expect(mockPrisma.user.update).toHaveBeenCalledOnce();
    });

    it("returns 400 when admin tries to demote themselves", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/users/user-1",
        headers: { cookie },
        payload: { role: "viewer" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Bad Request");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("returns 404 for unknown user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/users/unknown-id",
        headers: { cookie },
        payload: { name: "Does not exist" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // POST /api/users/:id/reset-password
  // ========================================================================

  describe("POST /api/users/:id/reset-password", () => {
    it("returns 200 on successful password reset", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-99",
        email: "other@plo.local",
      });
      mockPrisma.user.update.mockResolvedValue({});

      const res = await app.inject({
        method: "POST",
        url: "/api/users/user-99/reset-password",
        headers: { cookie },
        payload: { password: "newsecurepass123" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBeDefined();
      expect(mockPrisma.user.update).toHaveBeenCalledOnce();
    });

    it("returns 404 for unknown user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/users/unknown-id/reset-password",
        headers: { cookie },
        payload: { password: "newsecurepass123" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("returns 422 when password is too short", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/users/user-99/reset-password",
        headers: { cookie },
        payload: { password: "short" },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe("Unprocessable Entity");
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // DELETE /api/users/:id
  // ========================================================================

  describe("DELETE /api/users/:id", () => {
    it("returns 200 when deleting another user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-99",
        email: "other@plo.local",
        name: "Other",
      });
      mockPrisma.user.delete.mockResolvedValue({});

      const res = await app.inject({
        method: "DELETE",
        url: "/api/users/user-99",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBeDefined();
      expect(mockPrisma.user.delete).toHaveBeenCalledOnce();
    });

    it("returns 400 when trying to delete yourself", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/users/user-1",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Bad Request");
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it("returns 404 for unknown user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: "DELETE",
        url: "/api/users/unknown-id",
        headers: { cookie },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });
  });
});
