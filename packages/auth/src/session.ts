import { randomUUID } from "node:crypto";
import { db } from "@maschina/db";
import { sessions } from "@maschina/db";
import { and, eq, gt, lt } from "@maschina/db";
import { SessionExpiredError } from "./errors.js";
import { createTokenPair, hashToken, verifyRefreshToken } from "./jwt.js";
import type { JwtPayload, PlanTier, TokenPair, UserRole } from "./types.js";

export interface CreateSessionOptions {
  userId: string;
  email: string;
  role: UserRole;
  plan: PlanTier;
  orgId?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface SessionTokens extends TokenPair {
  sessionId: string;
}

// ─── Create session ───────────────────────────────────────────────────────────

export async function createSession(opts: CreateSessionOptions): Promise<SessionTokens> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const payload: Omit<JwtPayload, "iat" | "exp"> = {
    sub: opts.userId,
    email: opts.email,
    role: opts.role,
    plan: opts.plan,
    orgId: opts.orgId,
  };

  const { accessToken, refreshToken, refreshTokenHash, expiresIn } = await createTokenPair(
    payload,
    sessionId,
  );

  await db.insert(sessions).values({
    id: sessionId,
    userId: opts.userId,
    tokenHash: refreshTokenHash,
    userAgent: opts.userAgent,
    ipAddress: opts.ipAddress,
    expiresAt,
  });

  return { accessToken, refreshToken, expiresIn, sessionId };
}

// ─── Rotate session (refresh) ─────────────────────────────────────────────────

export async function rotateSession(
  refreshToken: string,
  opts: { userAgent?: string; ipAddress?: string },
): Promise<SessionTokens> {
  const payload = await verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        eq(sessions.userId, payload.sub),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session) throw new SessionExpiredError();

  // Invalidate old session immediately (prevents refresh token reuse)
  await db.delete(sessions).where(eq(sessions.id, session.id));

  // Fetch fresh user data for new token
  const { users } = await import("@maschina/db");
  const { subscriptions, plans } = await import("@maschina/db");

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user) throw new SessionExpiredError();

  // Get current plan
  const [sub] = await db
    .select({ tier: plans.tier })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  const newSessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const newPayload: Omit<JwtPayload, "iat" | "exp"> = {
    sub: user.id,
    email: user.email,
    role: user.role as UserRole,
    plan: (sub?.tier ?? "access") as PlanTier,
  };

  const {
    accessToken,
    refreshToken: newRefreshToken,
    refreshTokenHash,
    expiresIn,
  } = await createTokenPair(newPayload, newSessionId);

  await db.insert(sessions).values({
    id: newSessionId,
    userId: user.id,
    tokenHash: refreshTokenHash,
    userAgent: opts.userAgent ?? session.userAgent,
    ipAddress: opts.ipAddress ?? session.ipAddress,
    expiresAt,
  });

  return { accessToken, refreshToken: newRefreshToken, expiresIn, sessionId: newSessionId };
}

// ─── Revoke session ───────────────────────────────────────────────────────────

export async function revokeSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
