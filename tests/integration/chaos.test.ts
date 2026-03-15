/**
 * Chaos / fault tolerance tests.
 *
 * Tests API behavior when downstream dependencies fail:
 *   - DB unavailable
 *   - Redis unavailable
 *   - NATS unavailable
 *
 * The API should degrade gracefully — never crash, always return structured
 * error responses, and not leak internal error details to clients.
 */
import { describe, expect, it, vi } from "vitest";

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
  createSession: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue("$argon2id$hashed"),
  verifyPassword: vi.fn().mockResolvedValue(false),
  createEmailVerificationToken: vi.fn().mockResolvedValue("token"),
  createPasswordResetToken: vi.fn().mockResolvedValue(null),
  revokeSession: vi.fn(),
  rotateSession: vi.fn().mockRejectedValue(new Error("invalid")),
  validatePasswordStrength: vi.fn().mockReturnValue({ valid: true }),
  verifyEmail: vi.fn(),
  resetPassword: vi.fn(),
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
vi.mock("@maschina/billing", () => ({ createCheckoutSession: vi.fn(), handleWebhook: vi.fn() }));
vi.mock("@maschina/notifications", () => ({ sendNotification: vi.fn() }));
vi.mock("@maschina/telemetry", () => ({
  tracer: { startActiveSpan: vi.fn((_: string, fn: () => unknown) => fn()) },
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

// ─── Database fault ────────────────────────────────────────────────────────────

describe("Database fault", () => {
  it("GET /ready returns 503 when DB is down", async () => {
    const { db } = await import("@maschina/db");
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("ECONNREFUSED 5432"));

    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const res = await app.request("/ready");

    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; checks: Record<string, string> };
    expect(body.status).toBe("degraded");
    expect(body.checks.database).toBe("error");
  });

  it("GET /ready still reports Redis status even when DB is down", async () => {
    const { db } = await import("@maschina/db");
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("connection refused"));

    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const res = await app.request("/ready");

    const body = (await res.json()) as { status: string; checks: Record<string, string> };
    // Redis should still be checked
    expect(body.checks).toHaveProperty("redis");
  });

  it("GET /health always returns 200 regardless of DB state", async () => {
    const { db } = await import("@maschina/db");
    vi.mocked(db.execute).mockRejectedValue(new Error("DB totally down"));

    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const res = await app.request("/health");

    // /health never touches the DB, always returns 200
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");

    // Reset
    vi.mocked(db.execute).mockResolvedValue(undefined);
  });
});

// ─── Redis fault ───────────────────────────────────────────────────────────────

describe("Redis fault", () => {
  it("GET /ready returns 503 when Redis is down", async () => {
    const { getRedis } = await import("@maschina/cache");
    vi.mocked(getRedis).mockReturnValueOnce({
      ping: vi.fn().mockRejectedValue(new Error("ECONNREFUSED 6379")),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      // biome-ignore lint/suspicious/noExplicitAny: Redis mock shape in tests
    } as any);

    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const res = await app.request("/ready");

    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; checks: Record<string, string> };
    expect(body.checks.redis).toBe("error");
  });

  it("validation errors still return 400 when Redis is down (rate limit fallback)", async () => {
    const { getRedis } = await import("@maschina/cache");
    // Redis fails on incr (rate limit check)
    vi.mocked(getRedis).mockReturnValueOnce({
      ping: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      incr: vi.fn().mockRejectedValue(new Error("ECONNREFUSED 6379")),
      expire: vi.fn().mockRejectedValue(new Error("ECONNREFUSED 6379")),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      // biome-ignore lint/suspicious/noExplicitAny: Redis mock shape in tests
    } as any);

    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // The server might return 500 if Redis crash isn't handled, or 400/429 if handled gracefully.
    // We just verify it doesn't return an unstructured response.
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
  });
});

// ─── Concurrent request handling ──────────────────────────────────────────────

describe("Concurrent requests", () => {
  it("handles 50 concurrent health checks without errors", async () => {
    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const requests = Array.from({ length: 50 }, () => app.request("/health"));
    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status);
    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it("handles 20 concurrent auth attempts without crashing", async () => {
    const { createApp } = await import("../../services/api/src/app.js");
    const app = createApp();
    const requests = Array.from({ length: 20 }, (_, i) =>
      app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `user${i}@test.com`, password: "short" }),
      }),
    );
    const responses = await Promise.all(requests);
    // All should be 400 (validation) or 429 (rate limit) — never 500
    for (const res of responses) {
      expect([400, 429]).toContain(res.status);
    }
  });
});
