import { db } from "@maschina/db";
import { alerts, notifications, pushTokens } from "@maschina/db";
import { and, desc, eq, lt } from "@maschina/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth);

// ─── Push token management ────────────────────────────────────────────────────

// POST /notifications/tokens
// Register a device/browser push token.
app.post("/tokens", async (c) => {
  const { id: userId } = c.get("user");
  const body = await c.req.json<{
    platform: "apns" | "fcm" | "webpush";
    subscription: Record<string, unknown>;
    deviceName?: string;
  }>();

  if (!body.platform || !body.subscription) {
    throw new HTTPException(400, { message: "platform and subscription are required" });
  }

  const [token] = await db
    .insert(pushTokens)
    .values({
      userId,
      platform: body.platform,
      subscription: body.subscription,
      deviceName: body.deviceName,
    })
    .returning({ id: pushTokens.id });

  return c.json({ id: token.id }, 201);
});

// GET /notifications/tokens
// List registered tokens for the current user.
app.get("/tokens", async (c) => {
  const { id: userId } = c.get("user");

  const tokens = await db
    .select({
      id: pushTokens.id,
      platform: pushTokens.platform,
      deviceName: pushTokens.deviceName,
      createdAt: pushTokens.createdAt,
      lastUsedAt: pushTokens.lastUsedAt,
    })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId))
    .orderBy(desc(pushTokens.createdAt));

  return c.json(tokens);
});

// DELETE /notifications/tokens/:tokenId
// Unregister a specific push token (e.g. on logout).
app.delete("/tokens/:tokenId", async (c) => {
  const { id: userId } = c.get("user");
  const tokenId = c.req.param("tokenId");

  const [deleted] = await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.id, tokenId), eq(pushTokens.userId, userId)))
    .returning({ id: pushTokens.id });

  if (!deleted) throw new HTTPException(404, { message: "token not found" });

  return c.json({ id: deleted.id });
});

// ─── In-app notification feed ─────────────────────────────────────────────────

// GET /notifications
// Paginated notification feed. Supports ?unread=true and ?before=<cursor>.
app.get("/", async (c) => {
  const { id: userId } = c.get("user");
  const unreadOnly = c.req.query("unread") === "true";
  const before = c.req.query("before"); // ISO timestamp cursor
  const limit = Math.min(Number(c.req.query("limit") ?? "50"), 100);

  const conditions = [eq(notifications.userId, userId)];
  if (unreadOnly) conditions.push(eq(notifications.read, false));
  if (before) conditions.push(lt(notifications.createdAt, new Date(before)));

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return c.json(rows);
});

// PATCH /notifications/:id/read
// Mark a single notification as read.
app.patch("/:id/read", async (c) => {
  const { id: userId } = c.get("user");
  const notifId = c.req.param("id");

  const [updated] = await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(and(eq(notifications.id, notifId), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });

  if (!updated) throw new HTTPException(404, { message: "notification not found" });

  return c.json({ id: updated.id });
});

// PATCH /notifications/read-all
// Mark all unread notifications as read.
app.patch("/read-all", async (c) => {
  const { id: userId } = c.get("user");

  await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));

  return c.json({ ok: true });
});

// ─── Alerts ───────────────────────────────────────────────────────────────────

// GET /notifications/alerts
// Active (unacknowledged) alerts for the current user.
app.get("/alerts", async (c) => {
  const { id: userId } = c.get("user");

  const rows = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.acknowledged, false)))
    .orderBy(desc(alerts.createdAt));

  return c.json(rows);
});

// PATCH /notifications/alerts/:id/acknowledge
// Dismiss an alert.
app.patch("/alerts/:id/acknowledge", async (c) => {
  const { id: userId } = c.get("user");
  const alertId = c.req.param("id");

  const [updated] = await db
    .update(alerts)
    .set({ acknowledged: true, acknowledgedAt: new Date() })
    .where(and(eq(alerts.id, alertId), eq(alerts.userId, userId)))
    .returning({ id: alerts.id });

  if (!updated) throw new HTTPException(404, { message: "alert not found" });

  return c.json({ id: updated.id });
});

// PATCH /notifications/alerts/acknowledge-all
// Dismiss all active alerts.
app.patch("/alerts/acknowledge-all", async (c) => {
  const { id: userId } = c.get("user");

  await db
    .update(alerts)
    .set({ acknowledged: true, acknowledgedAt: new Date() })
    .where(and(eq(alerts.userId, userId), eq(alerts.acknowledged, false)));

  return c.json({ ok: true });
});

export default app;
