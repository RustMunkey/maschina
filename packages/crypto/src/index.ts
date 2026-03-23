/**
 * @maschina/crypto — AES-256-GCM encryption utilities.
 *
 * Key sources (separate concerns, never share secrets):
 *   DATA_ENCRYPTION_KEY  — user PII, agent config, run payloads, OAuth tokens
 *   HMAC_SECRET          — deterministic email lookup indexes (falls back to JWT_SECRET)
 *   CONNECTOR_ENCRYPTION_KEY — connector OAuth credentials (separate package)
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16;

// ─── Key derivation ───────────────────────────────────────────────────────────

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function getDataKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is not set");
  return deriveKey(raw);
}

export function getHmacSecret(): string {
  const secret = process.env.HMAC_SECRET ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("HMAC_SECRET (or JWT_SECRET fallback) is not set");
  return secret;
}

// ─── AES-256-GCM (separate IV column) ────────────────────────────────────────
// Use when the schema has a dedicated IV column (e.g. agents.configIv).

export function encrypt(plaintext: string, key?: Buffer): { ciphertext: string; iv: string } {
  const k = key ?? getDataKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, k, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString("hex"),
    iv: iv.toString("hex"),
  };
}

export function decrypt(ciphertext: string, iv: string, key?: Buffer): string {
  const k = key ?? getDataKey();
  const ivBuf = Buffer.from(iv, "hex");
  const data = Buffer.from(ciphertext, "hex");
  const tag = data.subarray(data.length - TAG_LENGTH);
  const encrypted = data.subarray(0, data.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, k, ivBuf);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// ─── Field encryption (IV embedded in value) ─────────────────────────────────
// Use when there is no separate IV column (e.g. users.email, users.name).
// Format stored in DB: "ivHex:ciphertextHex"

export function encryptField(plaintext: string, key?: Buffer): string {
  const { ciphertext, iv } = encrypt(plaintext, key);
  return `${iv}:${ciphertext}`;
}

export function decryptField(encoded: string, key?: Buffer): string {
  const colon = encoded.indexOf(":");
  if (colon === -1) throw new Error("Invalid encrypted field — missing IV separator");
  const iv = encoded.slice(0, colon);
  const ciphertext = encoded.slice(colon + 1);
  return decrypt(ciphertext, iv, key);
}

/** Returns true if the value looks like an encrypted field (iv:ciphertext). */
export function isEncryptedField(value: string): boolean {
  return /^[0-9a-f]{24}:/.test(value);
}

// ─── HMAC for deterministic lookups ──────────────────────────────────────────
// Used to index encrypted email fields without storing plaintext.

export function hmacEmail(email: string): string {
  return createHmac("sha256", getHmacSecret()).update(email.trim().toLowerCase()).digest("hex");
}
