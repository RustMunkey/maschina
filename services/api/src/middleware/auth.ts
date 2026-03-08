import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { resolveAuth } from "@maschina/auth";
import { can } from "@maschina/plans";
import type { Variables } from "../context.js";

// ─── Auth middleware ──────────────────────────────────────────────────────────
// Resolves the request identity from Authorization header.
// Supports both "Bearer <jwt>" and "Bearer msk_*" (API key) formats.
// Attaches user + tier to c.var for downstream handlers.

export const requireAuth = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization) {
    throw new HTTPException(401, { message: "Authorization header required" });
  }

  const ctx = await resolveAuth(c.req.raw.headers).catch(() => null);
  if (!ctx) {
    throw new HTTPException(401, { message: "Invalid or expired credentials" });
  }

  c.set("user", {
    id:        ctx.userId,
    email:     ctx.email,
    role:      ctx.role,
    tier:      ctx.plan,
    sessionId: ctx.sessionId,
    apiKeyId:  ctx.apiKeyId,
  });

  await next();
});

// ─── Optional auth (attaches user if present, doesn't block if missing) ───────

export const optionalAuth = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (authorization) {
    const ctx = await resolveAuth(c.req.raw.headers).catch(() => null);
    if (ctx) {
      c.set("user", {
        id:        ctx.userId,
        email:     ctx.email,
        role:      ctx.role,
        tier:      ctx.plan,
        sessionId: ctx.sessionId,
        apiKeyId:  ctx.apiKeyId,
      });
    }
  }
  await next();
});

// ─── Role guard ───────────────────────────────────────────────────────────────

export function requireRole(...roles: string[]) {
  return createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      throw new HTTPException(403, { message: "Insufficient permissions" });
    }
    await next();
  });
}

// ─── Feature gate ─────────────────────────────────────────────────────────────

export function requireFeature(feature: Parameters<typeof can.useMaschinaModel>[0] extends infer T ? keyof typeof can : never) {
  return createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw new HTTPException(401, { message: "Unauthorized" });

    const allowed = (can as any)[feature]?.(user.tier);
    if (!allowed) {
      throw new HTTPException(403, {
        message: `This feature requires a higher plan. Current plan: ${user.tier}`,
      });
    }
    await next();
  });
}
