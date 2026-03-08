import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { getRedis } from "@maschina/cache";

// ─── Redis sliding window rate limiter ────────────────────────────────────────
// Separate from monthly quota — this is short-window burst protection.
// Uses a simple fixed window counter in Redis.
// Applied per-IP on public routes, per-user on authenticated routes.

interface RateLimitOptions {
  /** Max requests per window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key prefix to namespace different limiters */
  prefix?: string;
}

function getRateLimitKey(prefix: string, identifier: string, window: number): string {
  const windowId = Math.floor(Date.now() / 1000 / window);
  return `rl:${prefix}:${identifier}:${windowId}`;
}

export function rateLimit(opts: RateLimitOptions) {
  const { limit, windowSeconds, prefix = "default" } = opts;

  return createMiddleware(async (c, next) => {
    const redis = getRedis();
    const ip = c.req.header("CF-Connecting-IP")
      ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim()
      ?? "unknown";

    const key = getRateLimitKey(prefix, ip, windowSeconds);

    const current = await redis.incr(key);
    if (current === 1) {
      // First request in window — set TTL
      await redis.expire(key, windowSeconds);
    }

    c.res.headers.set("X-RateLimit-Limit", String(limit));
    c.res.headers.set("X-RateLimit-Remaining", String(Math.max(0, limit - current)));

    if (current > limit) {
      throw new HTTPException(429, {
        message: `Too many requests. Limit: ${limit} per ${windowSeconds}s.`,
      });
    }

    await next();
  });
}

// Pre-configured limiters for common use cases
export const authRateLimit = rateLimit({ limit: 10,  windowSeconds: 60,  prefix: "auth" });   // 10/min on auth routes
export const apiRateLimit  = rateLimit({ limit: 300, windowSeconds: 60,  prefix: "api" });    // 300/min on API routes
export const strictLimit   = rateLimit({ limit: 5,   windowSeconds: 300, prefix: "strict" }); // 5 per 5min (password reset etc.)
