import { describe, expect, it, vi } from "vitest";

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
  db: { execute: vi.fn().mockResolvedValue(undefined) },
  sql: vi.fn().mockReturnValue({}),
}));

vi.mock("@maschina/cache", () => ({
  getRedis: vi.fn().mockReturnValue({
    ping: vi.fn().mockResolvedValue("PONG"),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }),
}));

import healthRoutes from "./health.js";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await healthRoutes.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
  });
});

describe("GET /ready", () => {
  it("returns 200 when DB and Redis are healthy", async () => {
    const res = await healthRoutes.request("/ready");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; checks: Record<string, string> };
    expect(body.status).toBe("ready");
    expect(body.checks.database).toBe("ok");
    expect(body.checks.redis).toBe("ok");
  });

  it("returns 503 when DB is down", async () => {
    const { db } = await import("@maschina/db");
    vi.mocked(db.execute).mockRejectedValueOnce(new Error("connection refused"));

    const res = await healthRoutes.request("/ready");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; checks: Record<string, string> };
    expect(body.status).toBe("degraded");
    expect(body.checks.database).toBe("error");
  });
});
