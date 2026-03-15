/**
 * Integration: full auth flow through the API middleware stack.
 *
 * Tests createApp() with all external dependencies mocked, verifying that
 * the complete middleware chain (CORS, secure headers, rate limiting, error
 * handling) works correctly for the auth endpoints.
 *
 * These use Hono's request() method — no live server required.
 * Run as part of: pnpm --filter @maschina/tests integration
 */
import { describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../services/api/src/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-that-is-at-least-32-chars-long!!",
    DATABASE_URL: "file:./test.db",
    REDIS_URL: "redis://localhost:6379",
    NATS_URL: "nats://localhost:4222",
    NODE_ENV: "test",
    PORT: 3000,
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    CORS_ORIGINS: "http://localhost:3001,http://localhost:5173",
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
    $count: vi.fn().mockReturnThis(),
  },
  users: {},
  userPasswords: {},
  subscriptions: {},
  plans: {},
  agents: {},
  sessions: {},
  apiKeys: {},
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@maschina/cache", () => ({
  getRedis: vi.fn().mockReturnValue({
    ping: vi.fn().mockResolvedValue("PONG"),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock("@maschina/auth", () => ({
  resolveAuth: vi.fn().mockRejectedValue(new Error("no auth")),
  createSession: vi.fn().mockResolvedValue({
    accessToken: "eyJhbGciOiJIUzI1NiJ9.test.token",
    refreshToken: "refresh-token-value",
  }),
  hashPassword: vi.fn().mockResolvedValue("$argon2id$hashed"),
  verifyPassword: vi.fn().mockResolvedValue(false),
  createEmailVerificationToken: vi.fn().mockResolvedValue("verify-token-123"),
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

vi.mock("@maschina/events", () => ({ Subjects: {} }));
vi.mock("@maschina/jobs", () => ({ dispatchAgentRun: vi.fn() }));
vi.mock("@maschina/model", () => ({
  resolveModel: vi.fn().mockReturnValue("claude-haiku-4-5"),
  validateModelAccess: vi.fn().mockReturnValue({ allowed: true }),
}));
vi.mock("@maschina/nats", () => ({ publishSafe: vi.fn() }));
vi.mock("@maschina/search", () => ({
  deleteDocument: vi.fn(),
  upsertDocument: vi.fn(),
  searchDocuments: vi.fn().mockResolvedValue({ hits: [] }),
}));
vi.mock("@maschina/billing", () => ({
  createCheckoutSession: vi.fn(),
  handleWebhook: vi.fn(),
}));
vi.mock("@maschina/notifications", () => ({ sendNotification: vi.fn() }));
vi.mock("@maschina/telemetry", () => ({
  tracer: { startActiveSpan: vi.fn((_name: string, fn: () => unknown) => fn()) },
}));
vi.mock("@maschina/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@maschina/compliance", () => ({}));
vi.mock("@maschina/connectors", () => ({}));
vi.mock("@maschina/marketplace", () => ({}));
vi.mock("@maschina/storage", () => ({}));
vi.mock("@maschina/webhooks", () => ({
  WEBHOOK_EVENTS: [
    "agent.run.started",
    "agent.run.completed",
    "agent.run.failed",
    "subscription.updated",
    "usage.quota_warning",
    "usage.quota_exceeded",
  ] as const,
  generateSecret: vi.fn().mockResolvedValue("whsec_testsecret"),
  hashSecret: vi.fn().mockResolvedValue("hashed_secret"),
  verifySecret: vi.fn().mockResolvedValue(true),
  deliver: vi.fn(),
}));
vi.mock("@maschina/analytics", () => ({}));
vi.mock("@maschina/chain", () => ({}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body?: unknown, headers?: Record<string, string>) {
  return {
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

// ─── Auth flow integration ────────────────────────────────────────────────────

describe("Auth flow (full app integration)", () => {
  it("GET /health returns 200 through the full middleware stack", async () => {
    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("POST /auth/register with invalid email returns 400", async () => {
    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const res = await app.request("/auth/register", {
      method: "POST",
      ...json({ email: "not-email", password: "Str0ng!Pass#1" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_error");
  });

  it("POST /auth/login without body returns 400", async () => {
    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const res = await app.request("/auth/login", {
      method: "POST",
      ...json({}),
    });
    expect(res.status).toBe(400);
  });

  it("any authenticated route without token returns 401", async () => {
    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const protectedRoutes = [
      ["GET", "/agents"],
      ["GET", "/users/me"],
      ["GET", "/keys"],
      ["GET", "/usage"],
      ["GET", "/nodes"],
    ];
    for (const [method, path] of protectedRoutes) {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    }
  });

  it("404 handler returns structured error for unknown routes", async () => {
    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const res = await app.request("/this-route-does-not-exist");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });
});

// ─── Rate limiting integration ─────────────────────────────────────────────────

describe("Rate limiting integration", () => {
  it("rate limit header is present on auth endpoint responses", async () => {
    const { getRedis } = await import("@maschina/cache");
    vi.mocked(getRedis).mockReturnValue({
      ping: vi.fn().mockResolvedValue("PONG"),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      // biome-ignore lint/suspicious/noExplicitAny: Redis mock shape in tests
    } as any);

    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const res = await app.request("/auth/register", {
      method: "POST",
      ...json({ email: "test@test.com", password: "short" }),
    });
    // Rate limit headers should be present (set by rateLimit middleware)
    expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const { getRedis } = await import("@maschina/cache");
    // Simulate 11 requests already made (limit is 10/min on auth routes)
    vi.mocked(getRedis).mockReturnValue({
      ping: vi.fn().mockResolvedValue("PONG"),
      incr: vi.fn().mockResolvedValue(11),
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      // biome-ignore lint/suspicious/noExplicitAny: Redis mock shape in tests
    } as any);

    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const res = await app.request("/auth/login", {
      method: "POST",
      ...json({ email: "user@test.com", password: "pass123" }),
    });
    expect(res.status).toBe(429);
  });
});
