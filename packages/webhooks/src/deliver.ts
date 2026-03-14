import type { WebhookEventType, WebhookPayload } from "./events.js";
import { HEADER, signPayload } from "./sign.js";

export interface DeliveryResult {
  success: boolean;
  status: number | null;
  body: string | null;
  attempt: number;
  durationMs: number;
}

// Exponential backoff delays (ms) per attempt: 10s, 30s, 90s, 5m, 15m
const BACKOFF_MS = [10_000, 30_000, 90_000, 300_000, 900_000];
export const MAX_ATTEMPTS = 5;

/**
 * Deliver a single webhook event to the given URL.
 * Does not retry — the caller (worker) controls the retry loop.
 */
export async function deliverOnce(
  url: string,
  secret: string,
  payload: WebhookPayload,
  attempt: number,
): Promise<DeliveryResult> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Maschina-Webhook/1.0",
        [HEADER]: signature,
        "X-Maschina-Event": payload.type,
        "X-Maschina-Delivery": payload.id,
      },
      body,
      signal: AbortSignal.timeout(10_000), // 10s timeout per attempt
    });

    const resBody = await res.text().catch(() => null);

    return {
      success: res.ok,
      status: res.status,
      body: resBody?.slice(0, 500) ?? null, // cap stored response size
      attempt,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      status: null,
      body: err instanceof Error ? err.message : "Unknown error",
      attempt,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Returns the delay in ms before the next retry attempt.
 * Returns null if no more retries should be attempted.
 */
export function nextRetryDelay(attempt: number): number | null {
  if (attempt >= MAX_ATTEMPTS) return null;
  return BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
}

/**
 * Build a typed webhook payload ready to dispatch.
 */
export function buildPayload<T extends WebhookPayload>(
  type: WebhookEventType,
  data: T["data"],
  deliveryId: string,
): WebhookPayload {
  return {
    id: deliveryId,
    type,
    created_at: new Date().toISOString(),
    api_version: "2026-03-13",
    data,
  } as WebhookPayload;
}
