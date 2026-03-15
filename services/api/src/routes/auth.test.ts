import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

// ─── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock("../env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-that-is-at-least-32-chars-long!!",
    DATABASE_URL: "file:./test.db",
    REDIS_URL: "redis://localhost:6379",
    NATS_URL: "nats://localhost:4222",
    NODE_ENV: "test",
    PORT: 3000,
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    CORS_ORIGINS: "http://localhost:3001",
    LOG_LEVEL: "info",
    API_BASE_URL: "http://localhost:3000",
    APP_URL: "http://localhost:5173",
  },
}));

vi.mock("@maschina/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue(undefined),
  },
  users: {},
  userPasswords: {},
  subscriptions: {},
  plans: {},
  eq: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@maschina/cache", () => ({
  getRedis: vi.fn().mockReturnValue({
    ping: vi.fn().mockResolvedValue("PONG"),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock("@maschina/auth", () => ({
  resolveAuth: vi.fn().mockRejectedValue(new Error("no auth")),
  createSession: vi.fn().mockResolvedValue({ accessToken: "tok", refreshToken: "ref" }),
  hashPassword: vi.fn().mockResolvedValue("$argon2id$hashed"),
  verifyPassword: vi.fn().mockResolvedValue(false),
  createEmailVerificationToken: vi.fn().mockResolvedValue("verify-token"),
  createPasswordResetToken: vi.fn().mockResolvedValue(null),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  rotateSession: vi.fn().mockRejectedValue(new Error("invalid token")),
  validatePasswordStrength: vi.fn().mockReturnValue({ valid: true }),
  verifyEmail: vi.fn().mockResolvedValue(undefined),
  resetPassword: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@maschina/plans", () => ({
  can: {
    skipBilling: vi.fn().mockReturnValue(false),
    useMaschinaModel: vi.fn().mockReturnValue(true),
    useApiKeys: vi.fn().mockReturnValue(true),
    useCloudExecution: vi.fn().mockReturnValue(true),
    useCompliance: vi.fn().mockReturnValue(false),
    useWebhooks: vi.fn().mockReturnValue(false),
    useAnalytics: vi.fn().mockReturnValue(false),
    useCustomConnectors: vi.fn().mockReturnValue(false),
    useMarketplace: vi.fn().mockReturnValue(false),
    inviteTeamMembers: vi.fn().mockReturnValue(false),
    hasPrioritySupport: vi.fn().mockReturnValue(false),
    hasSla: vi.fn().mockReturnValue(false),
    useOnPrem: vi.fn().mockReturnValue(false),
    useDedicatedInfra: vi.fn().mockReturnValue(false),
    useRbac: vi.fn().mockReturnValue(false),
    useSharedAgentPool: vi.fn().mockReturnValue(false),
    useWorkflowAutomation: vi.fn().mockReturnValue(false),
    useTeamDashboard: vi.fn().mockReturnValue(false),
  },
  getPlan: vi.fn().mockReturnValue({ maxAgents: -1 }),
}));

vi.mock("@maschina/usage", () => ({
  QuotaExceededError: class QuotaExceededError extends Error {
    quotaType = "api_call";
    result = { used: 0, limit: 100, resetsAt: new Date() };
  },
  enforceQuota: vi.fn().mockResolvedValue({ used: 0, limit: 100, resetsAt: new Date() }),
  recordApiCall: vi.fn().mockResolvedValue(undefined),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ─── Route + error handler imported after mocks ────────────────────────────────

import { errorHandler } from "../middleware/error.js";
import authRoutes from "./auth.js";

// Wrap the auth sub-app with the error handler for correct status code mapping
const app = new Hono();
app.route("/", authRoutes);
app.onError(errorHandler);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function post(path: string, body?: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── POST /auth/register ──────────────────────────────────────────────────────

describe("POST /register", () => {
  it("returns 400 when body is empty", async () => {
    const res = await post("/register", {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: unknown[] };
    expect(body.error).toBe("validation_error");
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.length).toBeGreaterThan(0);
  });

  it("returns 400 when email is invalid", async () => {
    const res = await post("/register", { email: "not-an-email", password: "Str0ng!Pass#1" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: Array<{ field: string }> };
    expect(body.error).toBe("validation_error");
    expect(body.fields.some((f) => f.field === "email")).toBe(true);
  });

  it("returns 400 when password is too short", async () => {
    const res = await post("/register", { email: "user@test.com", password: "short" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: Array<{ field: string }> };
    expect(body.error).toBe("validation_error");
    expect(body.fields.some((f) => f.field === "password")).toBe(true);
  });

  it("returns 400 when body is not JSON", async () => {
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe("POST /login", () => {
  it("returns 400 when body is empty", async () => {
    const res = await post("/login", {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 when email is missing", async () => {
    const res = await post("/login", { password: "anypassword" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: Array<{ field: string }> };
    expect(body.fields.some((f) => f.field === "email")).toBe(true);
  });

  it("returns 400 when password is missing", async () => {
    const res = await post("/login", { email: "user@test.com" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: Array<{ field: string }> };
    expect(body.fields.some((f) => f.field === "password")).toBe(true);
  });
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

describe("POST /refresh", () => {
  it("returns 400 when refreshToken is missing", async () => {
    const res = await post("/refresh", {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_error");
  });

  it("returns 401 when refreshToken is invalid", async () => {
    const res = await post("/refresh", { refreshToken: "invalid-token" });
    expect(res.status).toBe(401);
  });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

describe("POST /logout", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await post("/logout");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("http_error");
    expect(body.message).toMatch(/authorization/i);
  });

  it("returns 401 when Authorization header is invalid", async () => {
    const res = await app.request("/logout", {
      method: "POST",
      headers: { Authorization: "Bearer bad.token.here" },
    });
    expect(res.status).toBe(401);
  });
});

// ─── POST /auth/forgot-password ───────────────────────────────────────────────

describe("POST /forgot-password", () => {
  it("returns 400 when email is missing", async () => {
    const res = await post("/forgot-password", {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 when email is invalid", async () => {
    const res = await post("/forgot-password", { email: "bad" });
    expect(res.status).toBe(400);
  });
});
