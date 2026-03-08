import type { EventEnvelope, EventMap, Subject } from "@maschina/events";
import { AckPolicy, type ConsumerConfig, DeliverPolicy } from "nats";
import { getJs, getJsm, getNats, sc } from "./client.js";

// ─── Consumer options ─────────────────────────────────────────────────────────

export interface ConsumeOptions {
  /** Durable consumer name — survives service restarts */
  durable: string;
  /** Stream to consume from */
  stream: string;
  /** Filter to specific subject(s) within the stream */
  filterSubject?: string;
  /** Max in-flight messages before back-pressure kicks in */
  maxAckPending?: number;
  /** Deliver all messages from start, or only new ones */
  deliverPolicy?: DeliverPolicy;
}

// ─── Handler type ─────────────────────────────────────────────────────────────

export type EventHandler<S extends Subject> = (
  envelope: EventEnvelope<EventMap[S]>,
) => Promise<void>;

// ─── Push consumer (for event streams) ───────────────────────────────────────
// Best for: notifications, analytics, realtime fan-out.
// Each message delivered to all consumers in the group.

export async function subscribe<S extends Subject>(
  subject: S,
  handler: EventHandler<S>,
  opts: ConsumeOptions,
): Promise<void> {
  const jsm = await getJsm();
  const js = await getJs();

  const config: Partial<ConsumerConfig> = {
    durable_name: opts.durable,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: opts.deliverPolicy ?? DeliverPolicy.New,
    filter_subject: opts.filterSubject ?? subject,
    max_ack_pending: opts.maxAckPending ?? 100,
  };

  // Create or update consumer (idempotent)
  try {
    await jsm.consumers.add(opts.stream, config);
  } catch (err: any) {
    if (!err?.message?.includes("consumer name already in use")) throw err;
  }

  const consumer = await js.consumers.get(opts.stream, opts.durable);
  const messages = await consumer.consume();

  for await (const msg of messages) {
    try {
      const envelope = JSON.parse(sc.decode(msg.data)) as EventEnvelope<EventMap[S]>;
      await handler(envelope);
      msg.ack();
    } catch (err) {
      console.error(`[nats] Handler error for ${subject}:`, err);
      // Nak with delay — message will be redelivered after backoff
      msg.nak(5000);
    }
  }
}

// ─── Pull consumer (for job queues) ──────────────────────────────────────────
// Best for: work queues, daemon job dispatch.
// Each message delivered to exactly ONE consumer (WorkQueue retention).

export interface PullConsumerOptions {
  durable: string;
  stream: string;
  filterSubject?: string;
  /** How many messages to fetch per batch */
  batchSize?: number;
  /** Max wait time (ms) for a batch when queue is empty */
  maxWaitMs?: number;
}

export interface PulledMessage<T = unknown> {
  envelope: EventEnvelope<T>;
  ack: () => void;
  nak: (delayMs?: number) => void;
  term: () => void; // permanently discard — goes to dead letter
}

export async function createPullConsumer(opts: PullConsumerOptions): Promise<{
  fetch: () => AsyncIterable<PulledMessage>;
}> {
  const jsm = await getJsm();
  const js = await getJs();

  try {
    await jsm.consumers.add(opts.stream, {
      durable_name: opts.durable,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      ...(opts.filterSubject !== undefined && { filter_subject: opts.filterSubject }),
      max_deliver: 5, // max retry attempts before dead-lettering
      ack_wait: 30_000_000_000, // 30s in nanoseconds — must ack within this
    });
  } catch (err: any) {
    if (!err?.message?.includes("consumer name already in use")) throw err;
  }

  const consumer = await js.consumers.get(opts.stream, opts.durable);

  return {
    fetch: async function* () {
      const messages = await consumer.fetch({
        max_messages: opts.batchSize ?? 10,
        expires: opts.maxWaitMs ?? 5000,
      });

      for await (const msg of messages) {
        const envelope = JSON.parse(sc.decode(msg.data)) as EventEnvelope;
        yield {
          envelope,
          ack: () => msg.ack(),
          nak: (delayMs = 5000) => msg.nak(delayMs),
          term: () => msg.term(),
        };
      }
    },
  };
}
