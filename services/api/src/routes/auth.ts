import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createHmac } from "node:crypto";
import { db } from "@maschina/db";
import { users, userPasswords } from "@maschina/db";
import { eq } from "@maschina/db";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  createSession,
  rotateSession,
  revokeSession,
  createEmailVerificationToken,
  verifyEmail,
  createPasswordResetToken,
  resetPassword,
} from "@maschina/auth";
import {
  assertValid,
  sanitizeText,
  RegisterSchema,
  LoginSchema,
  RefreshSchema,
  RequestPasswordResetSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
} from "@maschina/validation";
import { requireAuth } from "../middleware/auth.js";
import { authRateLimit, strictLimit } from "../middleware/ratelimit.js";
import { env } from "../env.js";
import type { Variables } from "../context.js";

const app = new Hono<{ Variables: Variables }>();

// Deterministic lookup index for email — HMAC-SHA256 of lowercased email.
// When full email encryption is added, `users.email` becomes ciphertext and
// this index becomes the only way to look up by email. Until then it satisfies
// the NOT NULL constraint and supports future-proof lookup queries.
function emailIndex(email: string): string {
  return createHmac("sha256", env.JWT_SECRET)
    .update(email.toLowerCase().trim())
    .digest("hex");
}

// POST /auth/register
app.post("/register", authRateLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = assertValid(RegisterSchema, body);

  const strengthCheck = validatePasswordStrength(input.password);
  if (!strengthCheck.valid) throw new HTTPException(400, { message: strengthCheck.reason });

  const idx = emailIndex(input.email);

  // Check email uniqueness via the HMAC index (works with or without encryption)
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailIndex, idx))
    .limit(1);

  if (existing) throw new HTTPException(409, { message: "An account with that email already exists" });

  const passwordHash = await hashPassword(input.password);

  const [user] = await db
    .insert(users)
    .values({
      email:      input.email,
      emailIndex: idx,
      name:       input.name ? sanitizeText(input.name) : null,
      role:       "owner",
    })
    .returning({ id: users.id, email: users.email, role: users.role });

  await db.insert(userPasswords).values({ userId: user.id, passwordHash });

  // Access tier is the implicit default — no subscription row needed.
  // A row is only created when the user upgrades via Stripe Checkout.

  const tokens = await createSession({
    userId:    user.id,
    email:     user.email,
    role:      user.role as any,
    plan:      "access",
    userAgent: c.req.header("User-Agent"),
    ipAddress: c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For"),
  });

  // Create verification token and log it — replace with email send when mailer is wired
  createEmailVerificationToken(user.id)
    .then((token) => console.info(`[auth] email verification token for ${user.email}: ${token}`))
    .catch(console.error);

  return c.json({ user: { id: user.id, email: user.email }, ...tokens }, 201);
});

// POST /auth/login
app.post("/login", authRateLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = assertValid(LoginSchema, body);

  const idx = emailIndex(input.email);

  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.emailIndex, idx))
    .limit(1);

  const [pwRow] = user
    ? await db
        .select({ passwordHash: userPasswords.passwordHash })
        .from(userPasswords)
        .where(eq(userPasswords.userId, user.id))
        .limit(1)
    : [];

  // Constant-time path — always call verifyPassword so timing is identical
  // whether the user exists or not (prevents email enumeration via timing).
  const dummyHash = "$argon2id$v=19$m=65536,t=3,p=4$dummydummydummy$dummydummydummydummydummydummy";
  const valid = await verifyPassword(pwRow?.passwordHash ?? dummyHash, input.password);

  if (!user || !valid || user.deletedAt) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  // Get current plan tier — absence of subscription = Access
  const { subscriptions, plans } = await import("@maschina/db");
  const [sub] = await db
    .select({ tier: plans.tier })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  const tokens = await createSession({
    userId:    user.id,
    email:     user.email,
    role:      user.role as any,
    plan:      (sub?.tier ?? "access") as any,
    userAgent: c.req.header("User-Agent"),
    ipAddress: c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For"),
  });

  return c.json(tokens);
});

// POST /auth/refresh
app.post("/refresh", async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = assertValid(RefreshSchema, body);

  const tokens = await rotateSession(input.refreshToken, {
    userAgent: c.req.header("User-Agent"),
    ipAddress: c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For"),
  }).catch(() => {
    throw new HTTPException(401, { message: "Invalid or expired refresh token" });
  });

  return c.json(tokens);
});

// POST /auth/logout
app.post("/logout", requireAuth, async (c) => {
  const user = c.get("user");
  if (user.sessionId) await revokeSession(user.sessionId);
  return c.json({ success: true });
});

// POST /auth/verify-email
app.post("/verify-email", async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = assertValid(VerifyEmailSchema, body);
  await verifyEmail(input.token).catch(() => {
    throw new HTTPException(400, { message: "Invalid or expired verification token" });
  });
  return c.json({ success: true });
});

// POST /auth/forgot-password
app.post("/forgot-password", strictLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = assertValid(RequestPasswordResetSchema, body);

  // createPasswordResetToken handles user-not-found internally (returns null)
  // — we never reveal whether the email exists.
  createPasswordResetToken(input.email)
    .then((token) => {
      if (token) console.info(`[auth] password reset token for ${input.email}: ${token}`);
    })
    .catch(console.error);

  return c.json({ success: true, message: "If that email exists, a reset link has been sent" });
});

// POST /auth/reset-password
app.post("/reset-password", strictLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = assertValid(ResetPasswordSchema, body);

  const strengthResult = validatePasswordStrength(input.newPassword);
  if (!strengthResult.valid) throw new HTTPException(400, { message: strengthResult.reason ?? "Password too weak" });

  await resetPassword(input.token, input.newPassword).catch(() => {
    throw new HTTPException(400, { message: "Invalid or expired reset token" });
  });

  return c.json({ success: true });
});

export default app;
