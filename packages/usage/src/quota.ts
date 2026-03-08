import { get, incr, pipeline, secondsUntilEndOfMonth, set } from "@maschina/cache";
import { db } from "@maschina/db";
import { usageRollups } from "@maschina/db";
import { and, eq, gte } from "@maschina/db";
import { type PlanTier, getPlan } from "@maschina/plans";
import { quotaKey } from "./keys.js";
import { getCurrentPeriod } from "./period.js";
import type { QuotaCheckResult, UsageEventType } from "./types.js";

// ─── Map usage event types to plan quota fields ───────────────────────────────

function planLimitForType(tier: PlanTier, type: UsageEventType): number {
  const plan = getPlan(tier);
  switch (type) {
    case "agent_execution":
      return plan.monthlyAgentExecutions;
    case "api_call":
      return plan.monthlyApiCalls;
    case "model_inference":
      return plan.monthlyModelTokens;
    case "storage_read":
      return -1; // storage ops not quota-limited by count
    case "storage_write":
      return -1;
  }
}

// ─── Redis quota read with PostgreSQL cold-start fallback ─────────────────────

async function getCurrentUsage(
  userId: string,
  type: UsageEventType,
  period: string,
  periodStart: Date,
): Promise<number> {
  const key = quotaKey(userId, type, period);
  const cached = await get(key);

  // Cache hit — Redis is the source of truth for real-time enforcement
  if (cached !== null) return Number.parseInt(cached, 10);

  // Cold start (first request after deploy, Redis flush, or new user):
  // hydrate from PostgreSQL rollup checkpoint, then seed Redis
  const [rollup] = await db
    .select({ totalUnits: usageRollups.totalUnits })
    .from(usageRollups)
    .where(
      and(
        eq(usageRollups.userId, userId),
        eq(usageRollups.type, type),
        gte(usageRollups.periodStart, periodStart),
      ),
    )
    .limit(1);

  const current = rollup?.totalUnits ?? 0;

  // Seed Redis with the checkpoint value + set TTL to end of month
  // NX so we don't overwrite a concurrent write that beat us here
  await set(key, String(current), secondsUntilEndOfMonth());

  return current;
}

// ─── Check quota before an action ────────────────────────────────────────────

export async function checkQuota(
  userId: string,
  tier: PlanTier,
  type: UsageEventType,
  amount = 1,
): Promise<QuotaCheckResult> {
  const period = getCurrentPeriod();
  const limit = planLimitForType(tier, type);

  // Unlimited (enterprise or non-quota'd types)
  if (limit === -1) {
    return {
      allowed: true,
      used: 0,
      limit: -1,
      remaining: -1,
      percentageUsed: 0,
      status: "ok",
      resetsAt: period.resetsAt,
    };
  }

  const used = await getCurrentUsage(userId, type, period.key, period.start);
  const remaining = Math.max(0, limit - used);
  const percentageUsed = Math.round((used / limit) * 100);
  const allowed = used + amount <= limit;

  let status: QuotaCheckResult["status"] = "ok";
  if (percentageUsed >= 100) status = "exceeded";
  else if (percentageUsed >= 80) status = "warning";

  return {
    allowed,
    used,
    limit,
    remaining,
    percentageUsed,
    status,
    resetsAt: period.resetsAt,
  };
}

// ─── Increment quota counter in Redis after a successful action ───────────────

export async function incrementQuota(
  userId: string,
  type: UsageEventType,
  amount = 1,
): Promise<void> {
  const { key: periodKey, resetsAt } = getCurrentPeriod();
  const key = quotaKey(userId, type, periodKey);
  const ttl = Math.ceil((new Date(resetsAt).getTime() - Date.now()) / 1000);

  // INCRBY is atomic — safe under concurrent requests
  const pipe = pipeline();
  pipe.incrby(key, amount);
  pipe.expire(key, ttl);
  await pipe.exec();
}

// ─── Get full usage summary for a user (dashboard / billing) ─────────────────

export async function getUsageSummary(userId: string, tier: PlanTier) {
  const period = getCurrentPeriod();
  const types: UsageEventType[] = [
    "agent_execution",
    "api_call",
    "model_inference",
    "storage_read",
    "storage_write",
  ];

  const quotas = await Promise.all(
    types.map(async (type) => {
      const result = await checkQuota(userId, tier, type);
      return [type, result] as const;
    }),
  );

  return {
    userId,
    period: period.key,
    periodStart: period.start,
    periodEnd: period.end,
    quotas: Object.fromEntries(quotas),
  };
}

// ─── Build rate limit response headers ───────────────────────────────────────
// Mirrors the X-RateLimit-* headers that Anthropic and OpenAI return.

export function buildRateLimitHeaders(
  result: QuotaCheckResult,
  type: UsageEventType,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": result.limit === -1 ? "unlimited" : String(result.limit),
    "X-RateLimit-Remaining": result.remaining === -1 ? "unlimited" : String(result.remaining),
    "X-RateLimit-Used": String(result.used),
    "X-RateLimit-Reset": String(Math.floor(new Date(result.resetsAt).getTime() / 1000)),
    "X-Quota-Type": type,
  };
}
