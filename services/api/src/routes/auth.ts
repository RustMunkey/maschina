import {
  DeviceCodeExpiredError,
  DeviceCodeNotFoundError,
  OtpExpiredError,
  OtpInvalidError,
  OtpRateLimitError,
  confirmDeviceCode,
  createDeviceCode,
  createEmailVerificationToken,
  createOtp,
  createPasswordResetToken,
  createSession,
  hashPassword,
  pollDeviceCode,
  resetPassword,
  revokeSession,
  rotateSession,
  validatePasswordStrength,
  verifyEmail,
  verifyOtp,
  verifyPassword,
} from "@maschina/auth";
import { decryptField, encryptField, hmacEmail, isEncryptedField } from "@maschina/crypto";
import { db } from "@maschina/db";
import { userPasswords, users } from "@maschina/db";
import { eq } from "@maschina/db";
import { sendMagicCode } from "@maschina/email";
import {
  DeviceConfirmSchema,
  DeviceTokenSchema,
  LoginSchema,
  RefreshSchema,
  RegisterSchema,
  RequestPasswordResetSchema,
  ResetPasswordSchema,
  SendOtpSchema,
  VerifyEmailSchema,
  VerifyOtpSchema,
  assertValid,
  sanitizeText,
} from "@maschina/validation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { env } from "../env.js";
import { requireAuth } from "../middleware/auth.js";
import { authRateLimit, strictLimit } from "../middleware/ratelimit.js";

const app = new Hono<{ Variables: Variables }>();

function emailIndex(email: string): string {
  return hmacEmail(email);
}

// Decrypt email stored in DB — handles both legacy plaintext and encrypted values.
function decryptEmail(stored: string): string {
  return isEncryptedField(stored) ? decryptField(stored) : stored;
}

// Encrypt name if provided — stored as "ivHex:ciphertextHex".
function encryptName(name: string | null | undefined): string | null {
  if (!name) return null;
  try {
    return encryptField(name);
  } catch {
    return name; // DATA_ENCRYPTION_KEY not set — store plaintext (local dev only)
  }
}

function decryptName(stored: string | null): string | null {
  if (!stored) return null;
  return isEncryptedField(stored) ? decryptField(stored) : stored;
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

  if (existing)
    throw new HTTPException(409, { message: "An account with that email already exists" });

  const passwordHash = await hashPassword(input.password);

  let encryptedEmail: string;
  try {
    encryptedEmail = encryptField(input.email);
  } catch {
    encryptedEmail = input.email; // DATA_ENCRYPTION_KEY not set — local dev only
  }

  const [user] = await db
    .insert(users)
    .values({
      email: encryptedEmail,
      emailIndex: idx,
      name: encryptName(input.name ? sanitizeText(input.name) : null),
      role: "owner",
    })
    .returning({ id: users.id, email: users.email, role: users.role });

  await db.insert(userPasswords).values({ userId: user.id, passwordHash });

  // Access tier is the implicit default — no subscription row needed.
  // A row is only created when the user upgrades via Stripe Checkout.

  const plainEmail = input.email; // use plaintext for session + response (never return ciphertext)

  const tokens = await createSession({
    userId: user.id,
    email: plainEmail,
    role: user.role as any,
    plan: "access",
    userAgent: c.req.header("User-Agent"),
    ipAddress: c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For"),
  });

  // Create verification token and log it — replace with email send when mailer is wired
  createEmailVerificationToken(user.id)
    .then((token) => console.info(`[auth] email verification token for ${plainEmail}: ${token}`))
    .catch(console.error);

  return c.json({ user: { id: user.id, email: plainEmail }, ...tokens }, 201);
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
    userId: user.id,
    email: decryptEmail(user.email),
    role: user.role as any,
    plan: (sub?.tier ?? "access") as any,
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

// GET /auth/me — return current user from token
app.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "User not found" });
  return c.json({ data: { ...row, email: decryptEmail(row.email), plan: user.tier } });
});

// POST /auth/verify — test endpoint, always returns success
app.post("/verify", async (c) => {
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
  if (!strengthResult.valid)
    throw new HTTPException(400, { message: strengthResult.reason ?? "Password too weak" });

  await resetPassword(input.token, input.newPassword).catch(() => {
    throw new HTTPException(400, { message: "Invalid or expired reset token" });
  });

  return c.json({ success: true });
});

// ─── Magic link / OTP ─────────────────────────────────────────────────────────

// POST /auth/magic-link — send 6-digit code to email (works for both signin + signup)
app.post("/magic-link", authRateLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = assertValid(SendOtpSchema, body);

  // Generate and store OTP (doesn't require user to exist yet)
  const { code, expiresAt } = await createOtp(input.email);

  // Send email (no-op if RESEND_API_KEY not configured)
  sendMagicCode({ to: input.email, code }).catch(console.error);

  // Log code to console when email is not configured (local dev)
  if (!process.env.RESEND_API_KEY) {
    console.info(`[auth] OTP for ${input.email}: ${code} (expires ${expiresAt.toISOString()})`);
  }

  return c.json({ success: true, expiresAt: expiresAt.toISOString() });
});

// POST /auth/verify-otp — verify code, create/find user, return session
app.post("/verify-otp", authRateLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = assertValid(VerifyOtpSchema, body);

  try {
    await verifyOtp(input.email, input.code);
  } catch (err) {
    if (err instanceof OtpExpiredError)
      throw new HTTPException(400, { message: "Code has expired — request a new one" });
    if (err instanceof OtpRateLimitError)
      throw new HTTPException(429, { message: "Too many attempts — request a new code" });
    if (err instanceof OtpInvalidError)
      throw new HTTPException(400, {
        message: `Invalid code — ${(err as OtpInvalidError).attemptsLeft} attempt${(err as OtpInvalidError).attemptsLeft === 1 ? "" : "s"} remaining`,
      });
    throw err;
  }

  const idx = emailIndex(input.email);

  // Find or create user
  let [user] = await db
    .select({ id: users.id, email: users.email, role: users.role, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.emailIndex, idx))
    .limit(1);

  let isNew = false;

  if (!user) {
    // Check if account exists with a different emailIndex (e.g. created with a different JWT_SECRET)
    // and repair the index so future lookups work.
    const [byEmail] = await db
      .select({ id: users.id, email: users.email, role: users.role, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (byEmail) {
      // Repair emailIndex to match current JWT_SECRET
      await db.update(users).set({ emailIndex: idx }).where(eq(users.id, byEmail.id));
      user = byEmail;
    } else {
      // Genuinely new user — create account
      const { randomUUID } = await import("node:crypto");
      const { encryptField: ef } = await import("@maschina/crypto");
      const now = new Date();
      let storedEmail: string;
      try {
        storedEmail = ef(input.email);
      } catch {
        storedEmail = input.email; // DATA_ENCRYPTION_KEY not set — local dev only
      }
      const [created] = await db
        .insert(users)
        .values({
          id: randomUUID(),
          email: storedEmail,
          emailIndex: idx,
          role: "owner",
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: users.id,
          email: users.email,
          role: users.role,
          deletedAt: users.deletedAt,
        });
      user = created;
      isNew = true;
    }
  } else if (user.deletedAt) {
    throw new HTTPException(401, { message: "Account not found" });
  }

  // Mark email as verified (existing users signing in for first time with OTP)
  if (!isNew) {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
  }

  const { subscriptions, plans } = await import("@maschina/db");
  const [sub] = await db
    .select({ tier: plans.tier })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  const plainEmail = decryptEmail(user.email);

  const tokens = await createSession({
    userId: user.id,
    email: plainEmail,
    role: user.role as any,
    plan: (sub?.tier ?? "access") as any,
    userAgent: c.req.header("User-Agent"),
    ipAddress: c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For"),
  });

  return c.json({ user: { id: user.id, email: plainEmail, isNew }, ...tokens });
});

// ─── Device flow (CLI) ────────────────────────────────────────────────────────

// POST /auth/device/code — CLI calls this to start device flow
app.post("/device/code", strictLimit, async (c) => {
  const result = await createDeviceCode("cli");
  return c.json(result, 200);
});

// POST /auth/device/token — CLI polls this until confirmed
app.post("/device/token", authRateLimit, async (c) => {
  const body = await c.req.json().catch(() => null);
  const { deviceCode } = assertValid(DeviceTokenSchema, body);

  const result = await pollDeviceCode(deviceCode);

  if (result.status === "expired") throw new HTTPException(400, { message: "device_code_expired" });

  if (result.status === "pending") return c.json({ status: "pending" }, 202);

  // Confirmed — build a session for the CLI
  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, result.userId as string))
    .limit(1);

  if (!user) throw new HTTPException(404, { message: "User not found" });

  const { subscriptions, plans } = await import("@maschina/db");
  const [sub] = await db
    .select({ tier: plans.tier })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  const plainEmail = decryptEmail(user.email);

  const tokens = await createSession({
    userId: user.id,
    email: plainEmail,
    role: user.role as any,
    plan: (sub?.tier ?? "access") as any,
    userAgent: c.req.header("User-Agent") ?? "maschina-cli",
    ipAddress: c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For"),
  });

  return c.json({ status: "confirmed", user: { id: user.id, email: plainEmail }, ...tokens });
});

// POST /auth/device/confirm — user confirms in browser at /device page
app.post("/device/confirm", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const { userCode } = assertValid(DeviceConfirmSchema, body);
  const authUser = c.get("user");

  try {
    await confirmDeviceCode(userCode, authUser.id);
  } catch (err) {
    if (err instanceof DeviceCodeNotFoundError)
      throw new HTTPException(404, { message: "Invalid or expired device code" });
    if (err instanceof DeviceCodeExpiredError)
      throw new HTTPException(400, { message: "Device code has expired" });
    throw err;
  }

  return c.json({ success: true });
});

export default app;
