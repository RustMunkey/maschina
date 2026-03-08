import { Hono } from "hono";
import { db } from "@maschina/db";
import { usageEvents } from "@maschina/db";
import { and, eq, gte, lt, desc } from "@maschina/db";
import { getUsageSummary } from "@maschina/usage";
import { getPeriodForDate } from "@maschina/usage";
import { requireAuth } from "../middleware/auth.js";
import { trackApiCall } from "../middleware/quota.js";
import type { Variables } from "../context.js";

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth, trackApiCall);

// GET /usage  — current period summary with quota status
app.get("/", async (c) => {
  const user = c.get("user");
  const summary = await getUsageSummary(user.id, user.tier);
  return c.json(summary);
});

// GET /usage/history?type=&from=&to=&limit=
app.get("/history", async (c) => {
  const { id } = c.get("user");

  const type    = c.req.query("type");
  const from    = c.req.query("from");
  const to      = c.req.query("to");
  const limit   = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);

  const conditions = [eq(usageEvents.userId, id)];
  if (type)  conditions.push(eq(usageEvents.type, type as any));
  if (from)  conditions.push(gte(usageEvents.createdAt, new Date(from)));
  if (to)    conditions.push(lt(usageEvents.createdAt, new Date(to)));

  const rows = await db
    .select({
      id:           usageEvents.id,
      type:         usageEvents.type,
      units:        usageEvents.units,
      inputTokens:  usageEvents.inputTokens,
      outputTokens: usageEvents.outputTokens,
      model:        usageEvents.model,
      agentId:      usageEvents.agentId,
      createdAt:    usageEvents.createdAt,
    })
    .from(usageEvents)
    .where(and(...conditions))
    .orderBy(desc(usageEvents.createdAt))
    .limit(limit);

  return c.json({ events: rows, count: rows.length });
});

export default app;
