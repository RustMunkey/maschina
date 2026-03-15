import type { UsageEventType } from "./types.js";

// ─── Redis key schema ─────────────────────────────────────────────────────────
// All quota counters live under a consistent key structure.
// Changing this requires a migration of existing Redis keys.
//
// quota:{userId}:{type}:{YYYY-MM}
//   e.g. quota:550e8400-e29b-41d4-a716:agent_execution:2026-03

const PREFIX = "quota";

export function quotaKey(userId: string, type: UsageEventType, period: string): string {
  return `${PREFIX}:${userId}:${type}:${period}`;
}

export function allQuotaKeys(userId: string, period: string): string[] {
  const types: UsageEventType[] = [
    "agent_execution",
    "api_call",
    "model_inference",
    "storage_read",
    "storage_write",
  ];
  return types.map((t) => quotaKey(userId, t, period));
}

// ─── Other Redis key namespaces (used by other packages) ──────────────────────

/** Session cache: session metadata keyed by sessionId */
export function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

/** Plan feature cache: plan config keyed by tier — avoids DB lookup on every request */
export function planKey(tier: string): string {
  return `plan:${tier}`;
}

/** User plan cache: userId → current plan tier */
export function userPlanKey(userId: string): string {
  return `user_plan:${userId}`;
}

/** Alert dedup: tracks whether a quota threshold alert has been fired this period */
export function alertFiredKey(
  userId: string,
  type: UsageEventType,
  period: string,
  level: "warning" | "exceeded",
): string {
  return `alert_fired:${userId}:${type}:${period}:${level}`;
}
