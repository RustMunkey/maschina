import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITHM = "sha256";
const HEADER = "X-Maschina-Signature";

/**
 * Generate a webhook signing secret — 32 random bytes as hex.
 * Store the hash of this (via hashSecret) in the DB, hand the raw value to the user once.
 */
export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hash a raw secret for storage. Uses HMAC-SHA256 with a fixed key so
 * the stored value is non-reversible but deterministically verifiable.
 */
export function hashSecret(secret: string, appSecret: string): string {
  return createHmac(ALGORITHM, appSecret).update(secret).digest("hex");
}

/**
 * Sign a webhook payload. Returns the full header value.
 * Format: sha256=<hex>
 *
 * The secret here is the RAW secret (not the hash) — looked up per-delivery.
 * In practice the worker reconstructs the raw secret from the hash at dispatch time,
 * which means the raw secret must be stored encrypted or passed through NATS securely.
 * For now the worker receives the raw secret in the job payload (encrypted channel).
 */
export function signPayload(payload: string, secret: string): string {
  const sig = createHmac(ALGORITHM, secret).update(payload).digest("hex");
  return `${ALGORITHM}=${sig}`;
}

/**
 * Verify an inbound signature (for testing or inbound webhook validation).
 * Timing-safe comparison.
 */
export function verifySignature(payload: string, secret: string, header: string): boolean {
  const expected = signPayload(payload, secret);
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export { HEADER };
