import {
  agentRuns,
  agents,
  and,
  count,
  db,
  desc,
  eq,
  gte,
  isNull,
  sum,
  usageEvents,
} from "@maschina/db";
import { can } from "@maschina/plans";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { trackApiCall } from "../middleware/quota.js";

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth, trackApiCall);

function requireAnalytics() {
  return createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const user = c.get("user");
    if (!can.useAnalytics(user.tier)) {
      throw new HTTPException(403, {
        message: "Analytics requires Mach-5 plan or above",
      });
    }
    await next();
  });
}

function periodStart(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── GET /analytics/overview ───────────────────────────────────────────────────
// Agent run counts, token usage, active agents for the current month.

app.get("/overview", requireAnalytics(), async (c) => {
  const { id: userId } = c.get("user");
  const since = periodStart(30);

  const [runStats] = await db
    .select({
      total: count(),
      totalInputTokens: sum(agentRuns.inputTokens),
      totalOutputTokens: sum(agentRuns.outputTokens),
    })
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), gte(agentRuns.createdAt, since)));

  const [agentCount] = await db
    .select({ total: count() })
    .from(agents)
    .where(and(eq(agents.userId, userId), isNull(agents.deletedAt)));

  const statusBreakdown = await db
    .select({ status: agentRuns.status, count: count() })
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), gte(agentRuns.createdAt, since)))
    .groupBy(agentRuns.status);

  return c.json({
    period: "30d",
    runs: {
      total: runStats?.total ?? 0,
      byStatus: Object.fromEntries(
        statusBreakdown.map((r: { status: string; count: number }) => [r.status, r.count]),
      ),
    },
    tokens: {
      input: Number(runStats?.totalInputTokens ?? 0),
      output: Number(runStats?.totalOutputTokens ?? 0),
      total: Number(runStats?.totalInputTokens ?? 0) + Number(runStats?.totalOutputTokens ?? 0),
    },
    agents: {
      total: agentCount?.total ?? 0,
    },
  });
});

// ── GET /analytics/runs ───────────────────────────────────────────────────────
// Paginated run history with optional status filter.

app.get("/runs", requireAnalytics(), async (c) => {
  const { id: userId } = c.get("user");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const offset = Number(c.req.query("offset") ?? 0);
  const status = c.req.query("status");
  const days = Number(c.req.query("days") ?? 30);
  const since = periodStart(days);

  const conditions = [eq(agentRuns.userId, userId), gte(agentRuns.createdAt, since)];
  if (status) conditions.push(eq(agentRuns.status, status));

  const rows = await db
    .select({
      id: agentRuns.id,
      agentId: agentRuns.agentId,
      status: agentRuns.status,
      inputTokens: agentRuns.inputTokens,
      outputTokens: agentRuns.outputTokens,
      errorCode: agentRuns.errorCode,
      createdAt: agentRuns.createdAt,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
    })
    .from(agentRuns)
    .where(and(...conditions))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit)
    .offset(offset);

  const [total] = await db
    .select({ count: count() })
    .from(agentRuns)
    .where(and(...conditions));

  return c.json({ rows, total: total?.count ?? 0, limit, offset });
});

// ── GET /analytics/tokens ─────────────────────────────────────────────────────
// Daily token burn by model for the last N days.

app.get("/tokens", requireAnalytics(), async (c) => {
  const { id: userId } = c.get("user");
  const days = Math.min(Number(c.req.query("days") ?? 30), 90);
  const since = periodStart(days);

  const rows = await db
    .select({
      model: usageEvents.model,
      totalUnits: sum(usageEvents.units),
      inputTokens: sum(usageEvents.inputTokens),
      outputTokens: sum(usageEvents.outputTokens),
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        eq(usageEvents.type, "model_inference"),
        gte(usageEvents.createdAt, since),
      ),
    )
    .groupBy(usageEvents.model);

  return c.json({ period: `${days}d`, breakdown: rows });
});

// ── GET /analytics/agents/top ─────────────────────────────────────────────────
// Top agents by run count over the last 30 days.

app.get("/agents/top", requireAnalytics(), async (c) => {
  const { id: userId } = c.get("user");
  const since = periodStart(30);

  const rows = await db
    .select({
      agentId: agentRuns.agentId,
      runCount: count(),
      totalInputTokens: sum(agentRuns.inputTokens),
      totalOutputTokens: sum(agentRuns.outputTokens),
    })
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), gte(agentRuns.createdAt, since)))
    .groupBy(agentRuns.agentId)
    .orderBy(desc(count()))
    .limit(10);

  return c.json(rows);
});

export default app;
