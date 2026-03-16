import { constructWebhookEvent, handleWebhookEvent } from "@maschina/billing";
import type { HeliusWebhookPayload, ReceiptAnchoredEvent } from "@maschina/chain";
import { processHeliusWebhook } from "@maschina/chain";
import { db, webhookDeliveries, webhooks } from "@maschina/db";
import { and, desc, eq } from "@maschina/db";
import { dispatchWebhookJob } from "@maschina/jobs";
import { WEBHOOK_EVENTS, generateSecret, hashSecret } from "@maschina/webhooks";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type Stripe from "stripe";
import { z } from "zod";
import type { Variables } from "../context.js";
import { env } from "../env.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

// ─── Helius inbound webhook (settlement program events) ──────────────────────
// Helius POSTs enhanced transaction events when the settlement program
// processes a transaction.  We verify the auth header then dispatch.

app.post("/helius", async (c) => {
  const authHeader = c.req.header("authorization");
  const expected = env.HELIUS_WEBHOOK_SECRET;
  if (expected && authHeader !== expected) {
    throw new HTTPException(401, { message: "Invalid Helius webhook secret" });
  }

  const payload = (await c.req.json().catch(() => null)) as HeliusWebhookPayload | null;
  if (!payload || !Array.isArray(payload.transactions)) {
    throw new HTTPException(400, { message: "Invalid Helius webhook payload" });
  }

  await processHeliusWebhook(payload, {
    onReceiptAnchored: async (event: ReceiptAnchoredEvent) => {
      // Future: look up the run in the DB by signature/run_id and mark it as anchored.
      console.info("[helius] receipt anchored", {
        signature: event.signature,
        slot: event.slot,
        completedAt: event.completedAt,
      });
    },
  });

  return c.json({ received: true });
});

// ─── Stripe inbound webhook (no auth — raw body required) ────────────────────

app.post("/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) throw new HTTPException(400, { message: "Missing stripe-signature header" });

  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    throw new HTTPException(400, { message: `Webhook signature verification failed: ${msg}` });
  }

  try {
    await handleWebhookEvent(event);
  } catch (err) {
    console.error("[webhook] Processing failed:", err);
    throw new HTTPException(500, { message: "Webhook processing failed" });
  }

  return c.json({ received: true });
});

// ─── Outbound webhook management (authenticated) ──────────────────────────────

app.use("/", requireAuth);
app.use("/:id", requireAuth);
app.use("/:id/test", requireAuth);

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

const UpdateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  active: z.boolean().optional(),
});

// GET /webhooks
app.get("/", async (c) => {
  const { id: userId } = c.get("user");

  const rows = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      events: webhooks.events,
      status: webhooks.status,
      failureCount: webhooks.failureCount,
      createdAt: webhooks.createdAt,
      updatedAt: webhooks.updatedAt,
    })
    .from(webhooks)
    .where(eq(webhooks.userId, userId))
    .orderBy(desc(webhooks.createdAt));

  return c.json(rows);
});

// POST /webhooks
app.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = CreateWebhookSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const rawSecret = generateSecret();
  const secretHash = hashSecret(rawSecret, env.JWT_SECRET);

  const [webhook] = await db
    .insert(webhooks)
    .values({
      userId: user.id,
      url: parsed.data.url,
      events: parsed.data.events,
      secretHash,
      status: "active",
    })
    .returning({
      id: webhooks.id,
      url: webhooks.url,
      events: webhooks.events,
      status: webhooks.status,
      createdAt: webhooks.createdAt,
    });

  // Return the raw secret once — it is never retrievable again
  return c.json({ ...webhook, secret: rawSecret }, 201);
});

// GET /webhooks/:id
app.get("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const webhookId = c.req.param("id");

  const [row] = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      events: webhooks.events,
      status: webhooks.status,
      failureCount: webhooks.failureCount,
      createdAt: webhooks.createdAt,
      updatedAt: webhooks.updatedAt,
    })
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)));

  if (!row) throw new HTTPException(404, { message: "Webhook not found" });

  return c.json(row);
});

// PATCH /webhooks/:id
app.patch("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const webhookId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateWebhookSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const [existing] = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)));

  if (!existing) throw new HTTPException(404, { message: "Webhook not found" });

  const updates: Partial<typeof webhooks.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.url !== undefined) updates.url = parsed.data.url;
  if (parsed.data.events !== undefined) updates.events = parsed.data.events;
  if (parsed.data.active !== undefined) updates.status = parsed.data.active ? "active" : "disabled";

  const [updated] = await db
    .update(webhooks)
    .set(updates)
    .where(eq(webhooks.id, webhookId))
    .returning({
      id: webhooks.id,
      url: webhooks.url,
      events: webhooks.events,
      status: webhooks.status,
      updatedAt: webhooks.updatedAt,
    });

  return c.json(updated);
});

// DELETE /webhooks/:id
app.delete("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const webhookId = c.req.param("id");

  const [existing] = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)));

  if (!existing) throw new HTTPException(404, { message: "Webhook not found" });

  await db.delete(webhooks).where(eq(webhooks.id, webhookId));

  return c.body(null, 204);
});

// POST /webhooks/:id/test — fire a test event to the endpoint
app.post("/:id/test", async (c) => {
  const { id: userId } = c.get("user");
  const webhookId = c.req.param("id");

  const [row] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)));

  if (!row) throw new HTTPException(404, { message: "Webhook not found" });
  if (row.status !== "active") {
    throw new HTTPException(400, { message: "Webhook is not active" });
  }

  const deliveryId = crypto.randomUUID();
  const testPayload = {
    id: deliveryId,
    type: "agent.run.completed",
    created_at: new Date().toISOString(),
    api_version: "2026-03-13",
    data: {
      run_id: "test-run-id",
      agent_id: "test-agent-id",
      user_id: userId,
      model: "claude-haiku-4-5",
      input_tokens: 100,
      output_tokens: 200,
      duration_ms: 1234,
      turns: 1,
    },
  };

  await db.insert(webhookDeliveries).values({
    id: deliveryId,
    webhookId: row.id,
    event: "agent.run.completed",
    payload: testPayload,
    status: "pending",
  });

  await dispatchWebhookJob({
    deliveryId,
    webhookId: row.id,
    event: "agent.run.completed",
    payload: testPayload,
    attempt: 1,
  });

  return c.json({ delivery_id: deliveryId, message: "Test event queued" });
});

// GET /webhooks/:id/deliveries — delivery log for a webhook
app.get("/:id/deliveries", async (c) => {
  const { id: userId } = c.get("user");
  const webhookId = c.req.param("id");

  const [row] = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)));

  if (!row) throw new HTTPException(404, { message: "Webhook not found" });

  const deliveries = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(50);

  return c.json(deliveries);
});

export default app;
