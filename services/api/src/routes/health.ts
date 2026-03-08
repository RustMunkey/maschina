import { Hono } from "hono";
import { db } from "@maschina/db";
import { getRedis } from "@maschina/cache";
import { sql } from "@maschina/db";

const app = new Hono();

// GET /health — always 200, confirms process is alive
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// GET /ready — checks DB + Redis connectivity
app.get("/ready", async (c) => {
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
  return c.json({ status: healthy ? "ready" : "degraded", checks }, healthy ? 200 : 503);
});

export default app;
