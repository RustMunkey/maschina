import { getRedis } from "@maschina/cache";
import { db } from "@maschina/db";
import { sql } from "@maschina/db";
import { Hono } from "hono";

const app = new Hono();

async function getChecks(): Promise<{ checks: Record<string, "ok" | "error">; healthy: boolean }> {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    await getRedis().ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");
  return { checks, healthy };
}

// GET /health — liveness + dependency checks
app.get("/health", async (c) => {
  const { checks, healthy } = await getChecks();
  return c.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "maschina-api",
      checks,
      timestamp: new Date().toISOString(),
    },
    healthy ? 200 : 503,
  );
});

// GET /ready — alias for health (keeps backwards compat)
app.get("/ready", async (c) => {
  const { checks, healthy } = await getChecks();
  return c.json({ status: healthy ? "ready" : "degraded", checks }, healthy ? 200 : 503);
});

export default app;
