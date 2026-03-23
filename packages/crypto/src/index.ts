/**
 * @maschina/crypto — AES-256-GCM encryption utilities.
 *
 * Key sources (separate concerns, never share secrets):
 *   DATA_ENCRYPTION_KEY    — user PII, agent config, run payloads, OAuth tokens (v1 key)
 *   DATA_ENCRYPTION_KEY_V2 — new key after first rotation (v2)
 *   DATA_ENCRYPTION_KEY_Vn — keys for subsequent rotations
 *   ACTIVE_KEY_VERSION     — which version to use for new encryptions (default: 1)
 *   HMAC_SECRET            — deterministic email lookup indexes (falls back to JWT_SECRET)
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

// ─── Key version management ───────────────────────────────────────────────────

/**
 * Returns the key buffer for a given version.
 * v1 falls back to DATA_ENCRYPTION_KEY for backward compatibility.
 * v2+ read DATA_ENCRYPTION_KEY_V{n}.
 */
export function getDataKeyForVersion(version: number): Buffer {
  if (version === 1) {
    const raw = process.env.DATA_ENCRYPTION_KEY_V1 ?? process.env.DATA_ENCRYPTION_KEY;
    if (!raw) throw new Error("DATA_ENCRYPTION_KEY is not set");
    return deriveKey(raw);
  }
  const raw = process.env[`DATA_ENCRYPTION_KEY_V${version}`];
  if (!raw) throw new Error(`DATA_ENCRYPTION_KEY_V${version} is not set`);
  return deriveKey(raw);
}

/**
 * Returns the currently active key version for new encryptions.
 * Set ACTIVE_KEY_VERSION env var to change; defaults to 1.
 */
export function getActiveKeyVersion(): number {
  const v = process.env.ACTIVE_KEY_VERSION;
  if (!v) return 1;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n) || n < 1) return 1;
  return n;
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

// ─── Versioned encryption (separate IV + keyVersion columns) ─────────────────
// Like encrypt/decrypt but version-aware. Use for new code and key rotation.

export function encryptVersioned(plaintext: string): {
  ciphertext: string;
  iv: string;
  version: number;
} {
  const version = getActiveKeyVersion();
  const key = getDataKeyForVersion(version);
  const { ciphertext, iv } = encrypt(plaintext, key);
  return { ciphertext, iv, version };
}

export function decryptVersioned(ciphertext: string, iv: string, version: number): string {
  const key = getDataKeyForVersion(version);
  return decrypt(ciphertext, iv, key);
}

// ─── Field encryption (IV embedded in value) ─────────────────────────────────
// Use when there is no separate IV column (e.g. users.email, users.name).
// Legacy format stored in DB: "ivHex:ciphertextHex"
// Versioned format:           "v{n}:ivHex:ciphertextHex"

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

/**
 * Encrypts a field using the active key version.
 * Format: "v{version}:{ivHex}:{ciphertextHex}"
 */
export function encryptFieldVersioned(plaintext: string): string {
  const version = getActiveKeyVersion();
  const key = getDataKeyForVersion(version);
  const { ciphertext, iv } = encrypt(plaintext, key);
  return `v${version}:${iv}:${ciphertext}`;
}

/**
 * Decrypts a field that may be in either the legacy "iv:ct" format (v1)
 * or the versioned "v{n}:iv:ct" format.
 */
export function decryptFieldVersioned(encoded: string): string {
  // Versioned format: starts with "v" followed by digits then ":"
  const versionedMatch = encoded.match(/^v(\d+):([0-9a-f]{24}):(.+)$/);
  if (versionedMatch) {
    const version = Number.parseInt(versionedMatch[1], 10);
    const iv = versionedMatch[2];
    const ciphertext = versionedMatch[3];
    const key = getDataKeyForVersion(version);
    return decrypt(ciphertext, iv, key);
  }
  // Legacy format: "ivHex:ciphertextHex" — always v1
  const key = getDataKeyForVersion(1);
  const colon = encoded.indexOf(":");
  if (colon === -1) throw new Error("Invalid encrypted field — missing IV separator");
  const iv = encoded.slice(0, colon);
  const ciphertext = encoded.slice(colon + 1);
  return decrypt(ciphertext, iv, key);
}

/** Returns true if the value looks like an encrypted field (either format). */
export function isEncryptedField(value: string): boolean {
  // Versioned: "v{n}:{24hex}:..."
  if (/^v\d+:[0-9a-f]{24}:/.test(value)) return true;
  // Legacy: "{24hex}:..."
  return /^[0-9a-f]{24}:/.test(value);
}

// ─── HMAC for deterministic lookups ──────────────────────────────────────────
// Used to index encrypted email fields without storing plaintext.

export function hmacEmail(email: string): string {
  return createHmac("sha256", getHmacSecret()).update(email.trim().toLowerCase()).digest("hex");
}
