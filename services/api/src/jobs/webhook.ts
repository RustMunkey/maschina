/**
 * Webhook event dispatcher.
 *
 * Subscribes to the MASCHINA_EVENTS stream for agent run completion/failure
 * events. For each event, finds all active webhooks for the user that
 * subscribe to that event type, creates a delivery record, and dispatches
 * a webhook.dispatch job to the Python worker via NATS.
 */

import { db, webhookDeliveries, webhooks } from "@maschina/db";
import { and, eq, sql } from "@maschina/db";
import type { AgentRunCompletedData, AgentRunFailedData, EventEnvelope } from "@maschina/events";
import { dispatchWebhookJob } from "@maschina/jobs";
import { AckPolicy, DeliverPolicy, getJs, getJsm } from "@maschina/nats";
import { buildPayload } from "@maschina/webhooks";
import type { WebhookEventType } from "@maschina/webhooks";

const STREAM = "MASCHINA_EVENTS";
const CONSUMER_NAME = "api-webhook-dispatcher";
// Capture agent run completed + failed (not queued/started — too noisy for webhooks)
const FILTER_SUBJECTS = ["maschina.agent.run.completed", "maschina.agent.run.failed"];

export async function startWebhookDispatcher(): Promise<void> {
  const jsm = await getJsm();
  const js = await getJs();

  try {
    await jsm.consumers.add(STREAM, {
      durable_name: CONSUMER_NAME,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.New, // only events from boot onward — no backfill
      filter_subjects: FILTER_SUBJECTS,
      max_deliver: 3,
      ack_wait: 30_000_000_000, // 30s in ns
    });
  } catch (err: any) {
    if (!err?.message?.includes("consumer name already in use")) throw err;
  }

  const consumer = await js.consumers.get(STREAM, CONSUMER_NAME);
  const messages = await consumer.consume();

  console.log("[webhook-dispatcher] consuming agent run events");

  for await (const msg of messages) {
    try {
      const envelope = JSON.parse(new TextDecoder().decode(msg.data)) as EventEnvelope;
      await handleEvent(envelope);
      msg.ack();
    } catch (err) {
      console.error("[webhook-dispatcher] failed to process event", err);
      msg.nak(5_000);
    }
  }
}

async function handleEvent(envelope: EventEnvelope): Promise<void> {
  const subject = envelope.subject;

  if (subject === "maschina.agent.run.completed") {
    const data = envelope.data as AgentRunCompletedData;
    await fanOut(data.userId, "agent.run.completed", {
      run_id: data.runId,
      agent_id: data.agentId,
      user_id: data.userId,
      input_tokens: data.inputTokens,
      output_tokens: data.outputTokens,
      duration_ms: data.durationMs,
      turns: 1, // daemon doesn't surface turns yet — default 1
    });
    return;
  }

  if (subject === "maschina.agent.run.failed") {
    const data = envelope.data as AgentRunFailedData;
    await fanOut(data.userId, "agent.run.failed", {
      run_id: data.runId,
      agent_id: data.agentId,
      user_id: data.userId,
      error_code: data.errorCode,
      error_message: data.errorMessage,
    });
    return;
  }
}

async function fanOut(
  userId: string,
  eventType: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  // Find all active webhooks for this user subscribed to this event type.
  // JSON containment check: events @> '["event.type"]'
  const rows = await db
    .select({ id: webhooks.id, secretHash: webhooks.secretHash })
    .from(webhooks)
    .where(
      and(
        eq(webhooks.userId, userId),
        eq(webhooks.status, "active"),
        sql`${webhooks.events} @> ${JSON.stringify([eventType])}::jsonb`,
      ),
    );

  if (rows.length === 0) return;

  for (const webhook of rows) {
    const deliveryId = crypto.randomUUID();
    const payload = buildPayload(eventType, data as any, deliveryId);

    // Insert delivery record
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      webhookId: webhook.id,
      event: eventType,
      payload: payload as unknown as Record<string, unknown>,
      status: "pending",
    });

    // Dispatch to Python worker
    await dispatchWebhookJob({
      deliveryId,
      webhookId: webhook.id,
      event: eventType,
      payload: payload as unknown as Record<string, unknown>,
      attempt: 1,
    });
  }

  console.log(`[webhook-dispatcher] dispatched ${rows.length} webhook(s) for ${eventType}`);
}
