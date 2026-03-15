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
    $count: vi.fn().mockReturnThis(),
  },
  agents: {},
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock("@maschina/cache", () => ({
  getRedis: vi.fn().mockReturnValue({
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock("@maschina/auth", () => ({
  resolveAuth: vi.fn().mockRejectedValue(new Error("no auth")),
  createSession: vi.fn(),
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

vi.mock("@maschina/events", () => ({
  Subjects: {},
}));

vi.mock("@maschina/jobs", () => ({
  dispatchAgentRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@maschina/model", () => ({
  resolveModel: vi.fn().mockReturnValue("claude-haiku-4-5"),
  validateModelAccess: vi.fn().mockReturnValue({ allowed: true }),
}));

vi.mock("@maschina/nats", () => ({
  publishSafe: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@maschina/search", () => ({
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  upsertDocument: vi.fn().mockResolvedValue(undefined),
}));

// ─── Routes imported after mocks ──────────────────────────────────────────────

import { errorHandler } from "../middleware/error.js";
import agentRoutes from "./agents.js";

const app = new Hono();
app.route("/", agentRoutes);
app.onError(errorHandler);

// ─── Layer 1: Auth rejection (no DB calls) ────────────────────────────────────
// All agent routes use `app.use("*", requireAuth, ...)`, so ANY request without
// a valid Authorization header gets a 401 before any handler code runs.

describe("Agent routes — auth rejection", () => {
  it("GET / returns 401 without Authorization header", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("http_error");
    expect(body.message).toMatch(/authorization/i);
  });

  it("POST / returns 401 without Authorization header", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my-agent" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /:id returns 401 without Authorization header", async () => {
    const res = await app.request("/550e8400-e29b-41d4-a716-446655440000");
    expect(res.status).toBe(401);
  });

  it("PATCH /:id returns 401 without Authorization header", async () => {
    const res = await app.request("/550e8400-e29b-41d4-a716-446655440000", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "updated" }),
    });
    expect(res.status).toBe(401);
  });

  it("DELETE /:id returns 401 without Authorization header", async () => {
    const res = await app.request("/550e8400-e29b-41d4-a716-446655440000", {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("POST /:id/run returns 401 without Authorization header", async () => {
    const res = await app.request("/550e8400-e29b-41d4-a716-446655440000/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with garbage token", async () => {
    const res = await app.request("/", {
      headers: { Authorization: "Bearer garbage.token.here" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("http_error");
  });
});
