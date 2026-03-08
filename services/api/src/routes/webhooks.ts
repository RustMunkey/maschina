import { constructWebhookEvent, handleWebhookEvent } from "@maschina/billing";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const app = new Hono();

// POST /webhooks/stripe
// IMPORTANT: Must receive the raw body — not JSON.parse()'d.
// Hono does not auto-parse here because we handle the body manually.
app.post("/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) throw new HTTPException(400, { message: "Missing stripe-signature header" });

  // Read raw body as text — required for Stripe signature verification
  const rawBody = await c.req.text();

  let event: unknown;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    throw new HTTPException(400, { message: `Webhook signature verification failed: ${msg}` });
  }

  try {
    await handleWebhookEvent(event);
  } catch (err) {
    // Log + return 500 so Stripe retries
    console.error("[webhook] Processing failed:", err);
    throw new HTTPException(500, { message: "Webhook processing failed" });
  }

  return c.json({ received: true });
});

export default app;
