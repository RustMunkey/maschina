import { randomUUID } from "node:crypto";
import type { EventEnvelope, EventMap, Subject } from "@maschina/events";
import { getJs, sc } from "./client.js";

// ─── Typed publish ────────────────────────────────────────────────────────────
// Wraps the raw NATS payload in the standard EventEnvelope before publishing.
// JetStream publish gives us persistence + ack confirmation.

export async function publish<S extends Subject>(subject: S, data: EventMap[S]): Promise<void> {
  const js = await getJs();

  const envelope: EventEnvelope<EventMap[S]> = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    version: 1,
    subject,
    data,
  };

  await js.publish(subject, sc.encode(JSON.stringify(envelope)));
}

// ─── Fire-and-forget publish ──────────────────────────────────────────────────
// Same as publish but swallows errors — use for non-critical events where
// losing the odd event is acceptable (e.g. analytics, UI hints).

export function publishSafe<S extends Subject>(subject: S, data: EventMap[S]): void {
  publish(subject, data).catch((err) => {
    console.error(`[nats] Failed to publish ${subject}:`, err);
  });
}
