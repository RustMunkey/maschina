import { createHash, randomInt, randomUUID } from "node:crypto";
import { hmacEmail } from "@maschina/crypto";
import { db, otpCodes } from "@maschina/db";
import { and, eq, gt, isNotNull, isNull, lt, or } from "@maschina/db";
import { AuthError } from "./errors.js";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const CODE_LENGTH = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emailIndex(email: string): string {
  return hmacEmail(email);
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  // Cryptographically random 6-digit code (zero-padded)
  return String(randomInt(0, 1_000_000)).padStart(CODE_LENGTH, "0");
}

// ─── Create OTP ───────────────────────────────────────────────────────────────

export interface CreateOtpResult {
  code: string; // plain code — caller sends this via email, never store it
  expiresAt: Date;
}

export async function createOtp(email: string): Promise<CreateOtpResult> {
  const idx = emailIndex(email);
  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Invalidate all previous pending codes for this email (including rate-limited ones)
  await db.delete(otpCodes).where(and(eq(otpCodes.emailIndex, idx), isNull(otpCodes.usedAt)));

  await db.insert(otpCodes).values({
    id: randomUUID(),
    emailIndex: idx,
    codeHash: hashCode(code),
    attempts: 0,
    expiresAt,
    createdAt: new Date(),
  });

  return { code, expiresAt };
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────

export class OtpExpiredError extends AuthError {
  constructor() {
    super("OTP_EXPIRED", "Code has expired");
  }
}

export class OtpInvalidError extends AuthError {
  constructor(public readonly attemptsLeft: number) {
    super("OTP_INVALID", "Invalid code");
  }
}

export class OtpRateLimitError extends AuthError {
  constructor() {
    super("OTP_RATE_LIMIT", "Too many attempts — request a new code");
  }
}

export async function verifyOtp(email: string, code: string): Promise<void> {
  const idx = emailIndex(email);
  const now = new Date();

  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.emailIndex, idx), gt(otpCodes.expiresAt, now), isNull(otpCodes.usedAt)))
    .orderBy(otpCodes.createdAt)
    .limit(1);

  if (!row) throw new OtpExpiredError();

  if (row.attempts >= MAX_ATTEMPTS) throw new OtpRateLimitError();

  const match = hashCode(code) === row.codeHash;

  if (!match) {
    const attempts = row.attempts + 1;
    await db.update(otpCodes).set({ attempts }).where(eq(otpCodes.id, row.id));

    const attemptsLeft = MAX_ATTEMPTS - attempts;
    if (attemptsLeft <= 0) throw new OtpRateLimitError();
    throw new OtpInvalidError(attemptsLeft);
  }

  // Mark as used
  await db.update(otpCodes).set({ usedAt: now }).where(eq(otpCodes.id, row.id));
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export async function pruneExpiredOtps(): Promise<void> {
  await db
    .delete(otpCodes)
    .where(or(lt(otpCodes.expiresAt, new Date()), isNotNull(otpCodes.usedAt)));
}
