import { createAccessToken } from "@maschina/auth";
import { set } from "@maschina/cache";
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
  nodes,
  subscriptions,
  users,
} from "@maschina/db";
import {
  getCurrentPeriod,
  getUsageSummary,
  quotaKey,
  secondsUntilPeriodEnd,
} from "@maschina/usage";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth);

// ─── Admin gate ───────────────────────────────────────────────────────────────
// All admin endpoints require role=admin or tier=internal.

const requireAdmin = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const user = c.get("user");
  if (user.role !== "admin" && user.tier !== "internal") {
    throw new HTTPException(403, { message: "Admin access required" });
  }
  await next();
});

app.use("*", requireAdmin);

// ── GET /admin/stats ──────────────────────────────────────────────────────────
// Platform-wide stats for the console dashboard.

app.get("/stats", async (c) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalUsers] = await db
    .select({ count: count() })
    .from(users)
    .where(isNull(users.deletedAt));

  const [totalAgents] = await db
    .select({ count: count() })
    .from(agents)
    .where(isNull(agents.deletedAt));

  const [runsToday] = await db
    .select({ count: count() })
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, today));

  const [activeNodes] = await db
    .select({ count: count() })
    .from(nodes)
    .where(eq(nodes.status, "active"));

  return c.json({
    users: totalUsers?.count ?? 0,
    agents: totalAgents?.count ?? 0,
    runsToday: runsToday?.count ?? 0,
    activeNodes: activeNodes?.count ?? 0,
  });
});

// ── GET /admin/users ──────────────────────────────────────────────────────────
// Paginated user list. Supports ?limit, ?offset, ?role filters.

app.get("/users", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const offset = Number(c.req.query("offset") ?? 0);
  const role = c.req.query("role");

  const conditions = [isNull(users.deletedAt)];
  if (role) conditions.push(eq(users.role, role as "owner" | "admin" | "member" | "viewer"));

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(and(...conditions))
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const [total] = await db
    .select({ count: count() })
    .from(users)
    .where(and(...conditions));

  return c.json({ rows, total: total?.count ?? 0, limit, offset });
});

// ── GET /admin/users/:id ──────────────────────────────────────────────────────
// Full user detail including subscription and quota summary.

app.get("/users/:id", async (c) => {
  const userId = c.req.param("id");

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new HTTPException(404, { message: "User not found" });

  const [sub] = await db
    .select({
      planId: subscriptions.planId,
      status: subscriptions.status,
      interval: subscriptions.interval,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  return c.json({ ...user, subscription: sub ?? null });
});

// ── PATCH /admin/users/:id ────────────────────────────────────────────────────
// Update user role. Tier is derived from subscription — not stored on the user row.

app.patch("/users/:id", async (c) => {
  const userId = c.req.param("id");
  const body = await c.req.json<{ role?: string }>();

  const validRoles = ["owner", "admin", "member", "viewer"] as const;
  if (body.role && !validRoles.includes(body.role as (typeof validRoles)[number])) {
    throw new HTTPException(400, { message: "Invalid role" });
  }

  const [updated] = await db
    .update(users)
    .set({
      ...(body.role ? { role: body.role as (typeof validRoles)[number] } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id, role: users.role });

  if (!updated) throw new HTTPException(404, { message: "User not found" });

  return c.json(updated);
});

// ── POST /admin/users/:id/impersonate ─────────────────────────────────────────
// Issue a short-lived access token (15 min) for the target user.
// The admin can paste this into Authorization: Bearer <token> to act as that user.

app.post("/users/:id/impersonate", async (c) => {
  const targetId = c.req.param("id");

  const [target] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.id, targetId), isNull(users.deletedAt)))
    .limit(1);

  if (!target) throw new HTTPException(404, { message: "User not found" });

  // Short-lived impersonation token — 15 minutes
  const token = await createAccessToken({
    sub: target.id,
    email: target.email,
    role: target.role,
    plan: "access", // conservative — caller should check subscription separately
  });

  return c.json({ token, expiresIn: 900 });
});

// ── GET /admin/users/:id/quota ────────────────────────────────────────────────
// Full quota summary for a user. Requires knowing their current tier.
// Caller must pass ?tier= since the admin route doesn't load subscriptions here.

app.get("/users/:id/quota", async (c) => {
  const userId = c.req.param("id");
  const tier = (c.req.query("tier") ?? "access") as Parameters<typeof getUsageSummary>[1];

  const summary = await getUsageSummary(userId, tier);
  return c.json(summary);
});

// ── POST /admin/users/:id/quota/override ─────────────────────────────────────
// Manually set a Redis quota counter. Use for support cases (e.g. reset a user's
// counter after a billing error or refund an incorrectly counted burst).

app.post("/users/:id/quota/override", async (c) => {
  const userId = c.req.param("id");
  const body = await c.req.json<{ type: string; value: number }>();

  const validTypes = [
    "api_call",
    "agent_execution",
    "model_inference",
    "storage_read",
    "storage_write",
  ] as const;

  if (!validTypes.includes(body.type as (typeof validTypes)[number])) {
    throw new HTTPException(400, { message: "Invalid quota type" });
  }
  if (typeof body.value !== "number" || body.value < 0) {
    throw new HTTPException(400, { message: "value must be a non-negative number" });
  }

  const period = getCurrentPeriod();
  const key = quotaKey(userId, body.type as (typeof validTypes)[number], period.key);
  const ttl = secondsUntilPeriodEnd();

  await set(key, String(body.value), ttl);

  return c.json({ userId, type: body.type, value: body.value, period: period.key });
});

// ── GET /admin/nodes ──────────────────────────────────────────────────────────
// List all nodes with latest heartbeat and capabilities.

app.get("/nodes", async (c) => {
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);

  const statusFilter = status
    ? eq(nodes.status, status as "pending" | "active" | "suspended" | "offline" | "banned")
    : undefined;

  const rows = await db
    .select({
      id: nodes.id,
      userId: nodes.userId,
      name: nodes.name,
      status: nodes.status,
      tier: nodes.tier,
      region: nodes.region,
      version: nodes.version,
      reputationScore: nodes.reputationScore,
      totalTasksCompleted: nodes.totalTasksCompleted,
      totalTasksFailed: nodes.totalTasksFailed,
      lastHeartbeatAt: nodes.lastHeartbeatAt,
      teeAttested: nodes.teeAttested,
      createdAt: nodes.createdAt,
    })
    .from(nodes)
    .where(statusFilter)
    .orderBy(desc(nodes.createdAt))
    .limit(limit)
    .offset(offset);

  const [total] = await db.select({ count: count() }).from(nodes).where(statusFilter);

  return c.json({ rows, total: total?.count ?? 0, limit, offset });
});

// ── PATCH /admin/nodes/:id ────────────────────────────────────────────────────
// Update node status (suspend, reactivate, ban).

app.patch("/nodes/:id", async (c) => {
  const nodeId = c.req.param("id");
  const body = await c.req.json<{ status: string }>();

  const validStatuses = ["pending", "active", "suspended", "offline", "banned"] as const;
  if (!validStatuses.includes(body.status as (typeof validStatuses)[number])) {
    throw new HTTPException(400, { message: "Invalid status" });
  }

  const now = new Date();
  const [updated] = await db
    .update(nodes)
    .set({
      status: body.status as (typeof validStatuses)[number],
      updatedAt: now,
      ...(body.status === "suspended" ? { suspendedAt: now } : {}),
      ...(body.status === "banned" ? { bannedAt: now } : {}),
      ...(body.status === "active" ? { suspendedAt: null, bannedAt: null } : {}),
    })
    .where(eq(nodes.id, nodeId))
    .returning({ id: nodes.id, status: nodes.status });

  if (!updated) throw new HTTPException(404, { message: "Node not found" });

  return c.json(updated);
});

export default app;
