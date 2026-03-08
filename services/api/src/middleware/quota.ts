import { createMiddleware } from "hono/factory";
import { enforceQuota, buildRateLimitHeaders, recordApiCall } from "@maschina/usage";
import { can } from "@maschina/plans";
import type { Variables } from "../context.js";
import type { UsageEventType } from "@maschina/usage";

// ─── Quota middleware ─────────────────────────────────────────────────────────
// Checks the user's quota for a given action type.
// Attaches X-RateLimit-* headers to every response.
// Internal tier skips all checks.

export function requireQuota(type: UsageEventType, amount = 1) {
  return createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const user = c.get("user");
    if (!user) return next();

    // Internal tier: unlimited, skip all checks
    if (can.skipBilling(user.tier)) return next();

    const result = await enforceQuota({ userId: user.id, tier: user.tier }, type, amount);
    c.set("quota", result);

    await next();

    // Attach rate limit headers to response
    const headers = buildRateLimitHeaders(result, type);
    for (const [key, value] of Object.entries(headers)) {
      c.res.headers.set(key, value);
    }
  });
}

// ─── API call tracking ────────────────────────────────────────────────────────
// Applied to every authenticated route. Checks api_call quota + records the call.

export const trackApiCall = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const user = c.get("user");
  if (!user || can.skipBilling(user.tier)) return next();

  // Check quota synchronously (blocks if exceeded)
  const result = await enforceQuota({ userId: user.id, tier: user.tier }, "api_call");
  c.set("quota", result);

  // Record fire-and-forget — never blocks the response
  recordApiCall({ userId: user.id, apiKeyId: user.apiKeyId }).catch((err) => {
    console.error("[quota] Failed to record api_call:", err);
  });

  await next();

  // Rate limit headers on every response
  const headers = buildRateLimitHeaders(result, "api_call");
  for (const [key, value] of Object.entries(headers)) {
    c.res.headers.set(key, value);
  }
});
