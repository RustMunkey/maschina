/**
 * AES-256-GCM encryption for connector credentials.
 * Key must be 32 bytes (64 hex chars) from CONNECTOR_ENCRYPTION_KEY env var.
 * Falls back to JWT_SECRET padded/hashed for local dev.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? "dev-secret";
  // Derive a 32-byte key via SHA-256 so any string works
  return createHash("sha256").update(raw).digest();
}

export function encryptCredentials(plaintext: string): { encryptedData: string; iv: string } {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Store tag appended to ciphertext, both as hex
  return {
    encryptedData: Buffer.concat([encrypted, tag]).toString("hex"),
    iv: iv.toString("hex"),
  };
}

export function decryptCredentials(encryptedData: string, iv: string): string {
  const key = getKey();
  const ivBuf = Buffer.from(iv, "hex");
  const data = Buffer.from(encryptedData, "hex");

  const tag = data.subarray(data.length - TAG_LENGTH);
  const ciphertext = data.subarray(0, data.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, ivBuf);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
