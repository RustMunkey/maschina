import { db, apiKeys, users, subscriptions, plans } from "@maschina/db";
import type { ApiKey } from "@maschina/db";
import { and, eq, gt, isNull, or } from "@maschina/db";
import { compareApiKeyHash, isValidKeyFormat } from "./api-key.js";
import { verifyAccessToken } from "./jwt.js";
import { InvalidApiKeyError, InvalidTokenError, ApiKeyExpiredError, ApiKeyRevokedError } from "./errors.js";
import type { AuthContext, PlanTier, UserRole } from "./types.js";

// ─── Validate JWT access token ────────────────────────────────────────────────

export async function validateAccessToken(token: string): Promise<AuthContext> {
  const payload = await verifyAccessToken(token);

  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    plan: payload.plan,
    orgId: payload.orgId,
    method: "jwt",
  };
}

// ─── Validate API key ─────────────────────────────────────────────────────────

export async function validateApiKey(key: string): Promise<AuthContext> {
  if (!isValidKeyFormat(key)) throw new InvalidApiKeyError();

  // keyPrefix is stored on insert (first ~20 chars, display-safe, not secret).
  // Filtering by prefix narrows to at most one row before the hash comparison,
  // making this correct at any DB scale.
  const prefix = key.slice(0, 20);

  const candidates = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      keyHash: apiKeys.keyHash,
      isActive: apiKeys.isActive,
      expiresAt: apiKeys.expiresAt,
      monthlyLimit: apiKeys.monthlyLimit,
      usageCount: apiKeys.usageCount,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyPrefix, prefix), eq(apiKeys.isActive, true)))
    .limit(2); // prefix should be unique; 2 is a safety margin

  // Full hash comparison — timing-safe via crypto.timingSafeEqual inside compareApiKeyHash
  const match = candidates.find((k: ApiKey) => compareApiKeyHash(key, k.keyHash));

  if (!match) throw new InvalidApiKeyError();
  if (!match.isActive) throw new ApiKeyRevokedError();
  if (match.expiresAt && match.expiresAt < new Date()) throw new ApiKeyExpiredError();

  // Update last used (fire and forget — non-blocking)
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date(), usageCount: match.usageCount + 1 })
    .where(eq(apiKeys.id, match.id));

  // Fetch user + plan
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      role: users.role,
      plan: plans.tier,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(users.id, match.userId))
    .limit(1);

  if (!row) throw new InvalidApiKeyError();

  return {
    userId: row.userId,
    email: row.email,
    role: row.role as UserRole,
    plan: (row.plan ?? "access") as PlanTier,
    method: "api_key",
    apiKeyId: match.id,
  };
}

// ─── Resolve auth from request headers ───────────────────────────────────────

export async function resolveAuth(headers: Headers): Promise<AuthContext> {
  const authorization = headers.get("authorization");

  if (!authorization) throw new InvalidTokenError("Missing Authorization header");

  if (authorization.startsWith("Bearer msk_")) {
    // API key
    return validateApiKey(authorization.slice(7));
  }

  if (authorization.startsWith("Bearer ")) {
    // JWT
    return validateAccessToken(authorization.slice(7));
  }

  throw new InvalidTokenError("Invalid Authorization header format");
}
