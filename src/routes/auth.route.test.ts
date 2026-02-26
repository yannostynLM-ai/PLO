import { vi, beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic import of the server
// ---------------------------------------------------------------------------

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
  },
  // Stubs required by other routes registered in buildServer
  notification: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  project: { count: vi.fn() },
  event: { update: vi.fn(), updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
};

vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../lib/activity.js", () => ({ logActivity: vi.fn() }));
vi.mock("../lib/redis.js", () => ({ redis: { quit: vi.fn() } }));
vi.mock("../lib/queue.js", () => ({
  eventQueue: { add: vi.fn(), close: vi.fn() },
  deadLetterQueue: { add: vi.fn(), close: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const TEST_PASSWORD = "password123";
const TEST_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);

const MOCK_USER = {
  id: "user-1",
  email: "admin@plo.local",
  name: "Admin",
  role: "admin",
  password_hash: TEST_HASH,
  created_at: new Date(),
  updated_at: new Date(),
};

let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  const { buildServer } = await import("../server.js");
  app = await buildServer();
  await app.ready();

  // Pre-build a valid JWT cookie for protected-route tests
  const token = app.jwt.sign({
    id: MOCK_USER.id,
    email: MOCK_USER.email,
    name: MOCK_USER.name,
    role: MOCK_USER.role,
  });
  cookie = `plo_session=${token}`;
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// POST /api/auth/login
// =============================================================================

describe("POST /api/auth/login", () => {
  it("returns 200 and a user object with valid credentials", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(MOCK_USER);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: MOCK_USER.email, password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(MOCK_USER.email);
    expect(body.user.id).toBe(MOCK_USER.id);
    expect(body.user.role).toBe("admin");
  });

  it("sets an httpOnly plo_session cookie on valid login", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(MOCK_USER);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: MOCK_USER.email, password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(200);

    const setCookieHeader = res.headers["set-cookie"];
    const headerStr = Array.isArray(setCookieHeader)
      ? setCookieHeader.join("; ")
      : (setCookieHeader ?? "");

    expect(headerStr).toContain("plo_session=");
    expect(headerStr.toLowerCase()).toContain("httponly");
  });

  it("returns 401 with wrong password", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(MOCK_USER);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: MOCK_USER.email, password: "wrong-password" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Identifiants invalides");
  });

  it("returns 401 for unknown email (anti-timing compare still runs)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "unknown@example.com", password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Identifiants invalides");
  });

  it("returns 422 when email is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(422);
  });

  it("returns 422 when password is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: MOCK_USER.email },
    });

    expect(res.statusCode).toBe(422);
  });
});

// =============================================================================
// GET /api/auth/me
// =============================================================================

describe("GET /api/auth/me", () => {
  it("returns 200 with the JWT user payload when a valid cookie is present", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(MOCK_USER.email);
  });

  it("returns 401 when no cookie is provided", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when cookie contains an invalid JWT", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: "plo_session=invalid.jwt.token" },
    });

    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// POST /api/auth/logout
// =============================================================================

describe("POST /api/auth/logout", () => {
  it("returns 200 and clears the plo_session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe("Déconnecté");

    const setCookieHeader = res.headers["set-cookie"];
    const headerStr = Array.isArray(setCookieHeader)
      ? setCookieHeader.join("; ")
      : (setCookieHeader ?? "");

    // Cookie should be cleared (empty value or expires in the past)
    expect(headerStr).toContain("plo_session=");
  });
});
