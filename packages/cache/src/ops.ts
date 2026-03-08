import type { Redis as RedisType } from "ioredis";
import { getRedis } from "./client.js";

// ─── Core operations ──────────────────────────────────────────────────────────
// Thin typed wrappers over ioredis. All callers use these — never raw ioredis calls
// so we can swap backends (Valkey, Upstash, etc.) without touching application code.

type RedisClient = RedisType;

function r(): RedisClient {
  return getRedis();
}

// ─── String / atomic counter ──────────────────────────────────────────────────

export async function get(key: string): Promise<string | null> {
  return r().get(key);
}

export async function set(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  if (ttlSeconds) {
    await r().set(key, value, "EX", ttlSeconds);
  } else {
    await r().set(key, value);
  }
}

export async function del(...keys: string[]): Promise<void> {
  await r().del(...keys);
}

export async function exists(key: string): Promise<boolean> {
  return (await r().exists(key)) === 1;
}

export async function expire(key: string, ttlSeconds: number): Promise<void> {
  await r().expire(key, ttlSeconds);
}

export async function ttl(key: string): Promise<number> {
  return r().ttl(key);
}

// ─── Atomic counters ──────────────────────────────────────────────────────────

/** Atomically increment a counter by `amount` (default 1). Returns the new value. */
export async function incr(key: string, amount = 1): Promise<number> {
  if (amount === 1) return r().incr(key);
  return r().incrby(key, amount);
}

/** Atomically decrement a counter by `amount` (default 1). Returns the new value. */
export async function decr(key: string, amount = 1): Promise<number> {
  if (amount === 1) return r().decr(key);
  return r().decrby(key, amount);
}

// ─── Typed JSON helpers ───────────────────────────────────────────────────────

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await r().get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJson<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
): Promise<void> {
  await set(key, JSON.stringify(value), ttlSeconds);
}

// ─── Pipeline (batched commands) ──────────────────────────────────────────────
// Use when you need multiple ops in a single RTT — not transactional (use multi() for that).

export function pipeline() {
  return r().pipeline();
}

// ─── Atomic multi/exec (optimistic locking) ───────────────────────────────────

export function multi() {
  return r().multi();
}

// ─── Pub/Sub ──────────────────────────────────────────────────────────────────

export async function publish(channel: string, message: string): Promise<void> {
  await r().publish(channel, message);
}

// ─── Key expiry helpers ───────────────────────────────────────────────────────

/** Seconds until the end of the current UTC month — used for quota key TTLs. */
export function secondsUntilEndOfMonth(): number {
  const now = new Date();
  const endOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return Math.ceil((endOfMonth.getTime() - now.getTime()) / 1000);
}

/** Current month string for use in Redis keys: "2026-03" */
export function currentMonthKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
