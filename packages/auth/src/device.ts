import { createHash, randomBytes } from "node:crypto";
import { db, deviceCodes } from "@maschina/db";
import { and, eq, gt, isNull, lt } from "@maschina/db";
import { AuthError } from "./errors.js";

const DEVICE_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const POLL_INTERVAL_SECONDS = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashDeviceCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Generates a human-readable user code like "WXYZ-1234" */
function generateUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion
  const digits = "0123456789";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[randomBytes(1)[0] % set.length]).join("");
  return `${pick(chars, 4)}-${pick(digits, 4)}`;
}

// ─── Create device code ───────────────────────────────────────────────────────

export interface CreateDeviceCodeResult {
  deviceCode: string; // opaque, sent to CLI — hashed in DB
  userCode: string; // short code user enters at /device
  expiresAt: Date;
  pollInterval: number; // seconds
  verificationUri: string;
}

export async function createDeviceCode(scopes = "cli"): Promise<CreateDeviceCodeResult> {
  const deviceCode = randomBytes(32).toString("hex");
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);

  const baseUrl = process.env.APP_URL ?? "https://auth.maschina.dev";

  await db.insert(deviceCodes).values({
    id: randomBytes(16).toString("hex"),
    deviceCodeHash: hashDeviceCode(deviceCode),
    userCode,
    scopes,
    expiresAt,
    createdAt: new Date(),
  });

  return {
    deviceCode,
    userCode,
    expiresAt,
    pollInterval: POLL_INTERVAL_SECONDS,
    verificationUri: `${baseUrl}/device`,
  };
}

// ─── Poll device code (CLI calls this) ────────────────────────────────────────

export type DevicePollStatus = "pending" | "confirmed" | "expired";

export interface DevicePollResult {
  status: DevicePollStatus;
  userId?: string;
}

export async function pollDeviceCode(deviceCode: string): Promise<DevicePollResult> {
  const [row] = await db
    .select()
    .from(deviceCodes)
    .where(eq(deviceCodes.deviceCodeHash, hashDeviceCode(deviceCode)))
    .limit(1);

  if (!row) return { status: "expired" };
  if (row.expiresAt < new Date()) return { status: "expired" };

  if (row.confirmedAt && row.userId) {
    return { status: "confirmed", userId: row.userId };
  }

  return { status: "pending" };
}

// ─── Confirm device code (user confirms at /device) ───────────────────────────

export class DeviceCodeNotFoundError extends AuthError {
  constructor() {
    super("DEVICE_CODE_NOT_FOUND", "Invalid or expired device code");
  }
}

export class DeviceCodeExpiredError extends AuthError {
  constructor() {
    super("DEVICE_CODE_EXPIRED", "Device code has expired");
  }
}

export class DeviceCodeAlreadyConfirmedError extends AuthError {
  constructor() {
    super("DEVICE_CODE_ALREADY_CONFIRMED", "Device code already used");
  }
}

export async function confirmDeviceCode(userCode: string, userId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(deviceCodes)
    .where(and(eq(deviceCodes.userCode, userCode.toUpperCase()), isNull(deviceCodes.confirmedAt)))
    .limit(1);

  if (!row) throw new DeviceCodeNotFoundError();
  if (row.expiresAt < new Date()) throw new DeviceCodeExpiredError();
  if (row.confirmedAt) throw new DeviceCodeAlreadyConfirmedError();

  await db
    .update(deviceCodes)
    .set({ userId, confirmedAt: new Date() })
    .where(eq(deviceCodes.id, row.id));
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export async function pruneExpiredDeviceCodes(): Promise<void> {
  await db.delete(deviceCodes).where(lt(deviceCodes.expiresAt, new Date()));
}
