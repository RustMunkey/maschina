import { db } from "@maschina/db";
import { alerts, notifications, pushTokens } from "@maschina/db";
import { and, desc, eq, lt } from "@maschina/db";
import { notify } from "@maschina/notifications";
import { pushConfig } from "@maschina/push";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

// ─── Web Push VAPID key ───────────────────────────────────────────────────────

// GET /notifications/vapid-key
// Returns the VAPID public key needed by browsers to subscribe to Web Push.
app.get("/vapid-key", (c) => {
  const key = pushConfig.webpush.vapidPublicKey;
  if (!key) throw new HTTPException(503, { message: "Web Push not configured" });
  return c.json({ publicKey: key });
});

// GET /notifications/sw.js
// Push notification service worker — served with broad scope for root-level push handling.
app.get("/sw.js", (c) => {
  const js = `
self.addEventListener("push", function(event) {
  let data = {};
  try { data = event.data.json(); } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Maschina", {
      body: data.body ?? "",
      data: data.data ?? {},
      badge: "/badge-72x72.png",
    })
  );
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  const url = event.notification.data?.actionUrl ?? "/";
  event.waitUntil(clients.openWindow(url));
});
`.trim();
  c.header("Content-Type", "application/javascript");
  c.header("Service-Worker-Allowed", "/");
  return c.body(js);
});

// GET /notifications/subscribe
// Dev/testing HTML page — lets a browser subscribe to Web Push and register its token.
app.get("/subscribe", (c) => {
  const origin = new URL(c.req.url).origin;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Maschina — Enable Push Notifications</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 24px; }
  label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; }
  input { width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; box-sizing: border-box; margin-bottom: 16px; }
  button { padding: 12px 24px; background: #0f0f0f; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 15px; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  #status { margin-top: 16px; font-size: 14px; color: #555; white-space: pre-wrap; }
</style>
</head>
<body>
<h2>Enable Push Notifications</h2>
<p>Paste your API token below, then click the button to subscribe this browser to Maschina push notifications.</p>
<label for="token">Bearer token</label>
<input id="token" type="password" placeholder="eyJ..." autocomplete="off">
<button id="btn">Enable notifications</button>
<div id="status"></div>
<script>
const API = "${origin}";
const btn = document.getElementById("btn");
const status = document.getElementById("status");

function urlBase64ToUint8Array(b64) {
  const pad = "=".repeat((4 - b64.length % 4) % 4);
  const b = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(b)].map(c => c.charCodeAt(0)));
}

btn.addEventListener("click", async () => {
  const token = document.getElementById("token").value.trim();
  if (!token) { status.textContent = "Paste your Bearer token first."; return; }
  btn.disabled = true;
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      status.textContent = "Push notifications not supported in this browser.";
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      status.textContent = "Permission denied — enable notifications in browser settings.";
      btn.disabled = false;
      return;
    }
    status.textContent = "Fetching VAPID key...";
    const keyRes = await fetch(API + "/notifications/vapid-key");
    if (!keyRes.ok) throw new Error("Failed to fetch VAPID key: " + keyRes.status);
    const { publicKey } = await keyRes.json();

    status.textContent = "Registering service worker...";
    const reg = await navigator.serviceWorker.register(API + "/notifications/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    status.textContent = "Subscribing to push...";
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    status.textContent = "Registering token...";
    const regRes = await fetch(API + "/notifications/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({
        platform: "webpush",
        subscription: sub.toJSON(),
        deviceName: navigator.userAgent.slice(0, 80),
      }),
    });
    if (!regRes.ok) throw new Error("Token registration failed: " + regRes.status);
    const { id } = await regRes.json();
    status.textContent = "Done. Token registered: " + id + "\\nYou will receive push notifications when agents complete.";
  } catch (err) {
    status.textContent = "Error: " + err.message;
    btn.disabled = false;
  }
});
</script>
</body>
</html>`;
  return c.html(html);
});

// ─── Auth required for all routes below ──────────────────────────────────────

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

// ─── Test push ────────────────────────────────────────────────────────────────

// POST /notifications/test
// Send a test push + in-app notification to the authenticated user.
// Useful for verifying push token registration from the CLI.
app.post("/test", async (c) => {
  const { id: userId } = c.get("user");

  await notify({
    type: "system_announcement",
    userId,
    channels: ["in_app", "push"],
    data: {
      message: "Push notifications are working.",
    },
  });

  return c.json({ ok: true });
});

export default app;
