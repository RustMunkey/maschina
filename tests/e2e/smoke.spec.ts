/**
 * Smoke tests — verify the API is alive and responding.
 *
 * These run against a LIVE server. Set API_BASE_URL env var to the server URL.
 * They are skipped automatically in CI unless RUN_E2E=true is set.
 *
 * Run locally:
 *   RUN_E2E=true API_BASE_URL=http://localhost:3000 pnpm --filter @maschina/tests e2e
 */
import { describe, expect, it } from "vitest";

const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const RUN_E2E = process.env.RUN_E2E === "true";

// Skip all tests unless RUN_E2E is set
const test = RUN_E2E ? it : it.skip;

async function get(path: string, headers?: Record<string, string>): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, { headers });
}

async function post(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ─── Smoke tests ──────────────────────────────────────────────────────────────

describe("API smoke tests", () => {
  test("GET /health returns 200", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("GET /ready returns 200 or 503 (never 404)", async () => {
    const res = await get("/ready");
    expect([200, 503]).toContain(res.status);
    const body = (await res.json()) as { status: string };
    expect(["ready", "degraded"]).toContain(body.status);
  });

  test("unknown route returns 404", async () => {
    const res = await get("/this-does-not-exist-xyz");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });
});

describe("Auth smoke tests", () => {
  test("POST /auth/register with invalid body returns 400", async () => {
    const res = await post("/auth/register", { email: "not-an-email" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_error");
  });

  test("POST /auth/login without auth returns 400", async () => {
    const res = await post("/auth/login", {});
    expect(res.status).toBe(400);
  });

  test("GET /agents without token returns 401", async () => {
    const res = await get("/agents");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("http_error");
  });
});

describe("Response shape smoke tests", () => {
  test("error responses always have an 'error' field", async () => {
    const checks = [get("/nonexistent"), get("/agents"), post("/auth/login", {})];
    const results = await Promise.all(checks);
    for (const res of results) {
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    }
  });

  test("success responses are valid JSON", async () => {
    const res = await get("/health");
    const body = await res.json();
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();
  });
});
