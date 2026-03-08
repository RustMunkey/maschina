import { db, users, verificationTokens, userPasswords } from "@maschina/db";
import { and, eq, gt } from "@maschina/db";
import { createHash } from "node:crypto";
import { hashPassword } from "./password.js";
import { generateSecureToken } from "./jwt.js";
import { AuthError } from "./errors.js";

const EMAIL_VERIFY_EXPIRY_MS = 24 * 60 * 60 * 1000;      // 24 hours
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;           // 1 hour

function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ─── Email verification ───────────────────────────────────────────────────────

export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token = generateSecureToken(32);
  const tokenHash = hashVerificationToken(token);

  await db.insert(verificationTokens).values({
    userId,
    type: "email_verification",
    tokenHash,
    expiresAt: new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MS),
  });

  return token; // caller is responsible for emailing this
}

export async function verifyEmail(token: string): Promise<void> {
  const tokenHash = hashVerificationToken(token);

  const [record] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, tokenHash),
        eq(verificationTokens.type, "email_verification"),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!record || record.usedAt) {
    throw new AuthError("Invalid or expired verification token", "INVALID_TOKEN");
  }

  await Promise.all([
    db.update(users).set({ emailVerified: true }).where(eq(users.id, record.userId)),
    db
      .update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, record.id)),
  ]);
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function createPasswordResetToken(email: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) return null; // don't reveal whether email exists

  const token = generateSecureToken(32);
  const tokenHash = hashVerificationToken(token);

  await db.insert(verificationTokens).values({
    userId: user.id,
    type: "password_reset",
    tokenHash,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS),
  });

  return token;
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashVerificationToken(token);

  const [record] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, tokenHash),
        eq(verificationTokens.type, "password_reset"),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!record || record.usedAt) {
    throw new AuthError("Invalid or expired reset token", "INVALID_TOKEN");
  }

  const passwordHash = await hashPassword(newPassword);

  await Promise.all([
    db
      .insert(userPasswords)
      .values({ userId: record.userId, passwordHash })
      .onConflictDoUpdate({
        target: userPasswords.userId,
        set: { passwordHash, updatedAt: new Date() },
      }),
    db
      .update(verificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(verificationTokens.id, record.id)),
  ]);
}
