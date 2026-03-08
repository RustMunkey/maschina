import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { KeyEnvironment } from "./types.js";

const KEY_PREFIXES = {
  live: "msk_live_",
  test: "msk_test_",
} as const;

// Key format: msk_live_<32 bytes base64url> → ~55 chars total
//
// `prefix` = first 20 chars of the raw key, stored in DB as `key_prefix`.
// Used for lookup narrowing in validateApiKey (filter + hash compare).
// Safe to store — 20 chars of a 55-char random key reveals nothing usable.
export function generateApiKey(env: KeyEnvironment = "live"): {
  key: string;
  hash: string;
  prefix: string;
} {
  const envPrefix = KEY_PREFIXES[env];
  const secret = randomBytes(32).toString("base64url");
  const key = `${envPrefix}${secret}`;
  const hash = hashApiKey(key);
  const prefix = key.slice(0, 20);
  return { key, hash, prefix };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Timing-safe comparison — prevents timing attacks
export function compareApiKeyHash(key: string, storedHash: string): boolean {
  const keyHash = Buffer.from(hashApiKey(key), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (keyHash.length !== stored.length) return false;
  return timingSafeEqual(keyHash, stored);
}

export function parseKeyEnvironment(key: string): KeyEnvironment | null {
  if (key.startsWith(KEY_PREFIXES.live)) return "live";
  if (key.startsWith(KEY_PREFIXES.test)) return "test";
  return null;
}

export function isValidKeyFormat(key: string): boolean {
  return parseKeyEnvironment(key) !== null && key.length >= 40;
}
