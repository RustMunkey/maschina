import { checkQuota, buildRateLimitHeaders } from "./quota.js";
import { recordApiCall } from "./record.js";
import type { PlanTier } from "@maschina/plans";
import type { UsageEventType, QuotaCheckResult } from "./types.js";

// ─── Quota enforcement middleware ─────────────────────────────────────────────
// Framework-agnostic context shape — adapt to Hono/Fastify in services/api.
// The middleware attaches quota info to the request context so route handlers
// can read X-RateLimit-* values without re-querying.

export interface QuotaContext {
  userId: string;
  tier: PlanTier;
}

export class QuotaExceededError extends Error {
  readonly statusCode = 429;
  readonly quotaType: UsageEventType;
  readonly result: QuotaCheckResult;

  constructor(type: UsageEventType, result: QuotaCheckResult) {
    super(
      `Quota exceeded for ${type}. Used ${result.used}/${result.limit}. ` +
      `Resets at ${result.resetsAt}.`,
    );
    this.name = "QuotaExceededError";
    this.quotaType = type;
    this.result = result;
  }
}

/**
 * Check quota for a given usage type and throw if exceeded.
 * Returns the quota result (with rate limit headers) for attaching to the response.
 *
 * Usage in a Hono route:
 *   const quota = await enforceQuota({ userId, tier }, "api_call");
 *   // ... handle request ...
 *   return c.json(data, 200, buildRateLimitHeaders(quota, "api_call"));
 */
export async function enforceQuota(
  ctx: QuotaContext,
  type: UsageEventType,
  amount = 1,
): Promise<QuotaCheckResult> {
  const result = await checkQuota(ctx.userId, ctx.tier, type, amount);

  if (!result.allowed) {
    throw new QuotaExceededError(type, result);
  }

  return result;
}

/**
 * Convenience: check api_call quota AND record the call atomically.
 * Call this at the start of every authenticated API route.
 * Returns quota info for response headers.
 */
export async function enforceAndRecordApiCall(
  ctx: QuotaContext,
  apiKeyId?: string,
): Promise<QuotaCheckResult> {
  const result = await enforceQuota(ctx, "api_call");

  // Record after the quota check passes — fire-and-forget
  recordApiCall({ userId: ctx.userId, apiKeyId }).catch((err) => {
    console.error("[usage] Failed to record api_call:", err);
  });

  return result;
}

export { buildRateLimitHeaders };
