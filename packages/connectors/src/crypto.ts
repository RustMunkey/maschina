/**
 * AES-256-GCM encryption for connector credentials.
 * Uses CONNECTOR_ENCRYPTION_KEY, falls back to DATA_ENCRYPTION_KEY.
 * Never falls back to JWT_SECRET — that key is for JWT signing only.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY ?? process.env.DATA_ENCRYPTION_KEY;
  if (!raw)
    throw new Error("CONNECTOR_ENCRYPTION_KEY (or DATA_ENCRYPTION_KEY fallback) is not set");
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
