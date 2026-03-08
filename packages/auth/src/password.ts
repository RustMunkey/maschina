import argon2 from "argon2";
import type { PasswordValidation } from "./types.js";

// OWASP-recommended argon2id config
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Returns true if the hash was created with old params and should be rehashed
export async function needsRehash(hash: string): Promise<boolean> {
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}

export function validatePasswordStrength(password: string): PasswordValidation {
  if (password.length < 8) {
    return { valid: false, reason: "Password must be at least 8 characters" };
  }
  if (password.length > 128) {
    return { valid: false, reason: "Password must be under 128 characters" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: "Password must contain at least one uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: "Password must contain at least one lowercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: "Password must contain at least one number" };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, reason: "Password must contain at least one special character" };
  }
  return { valid: true };
}
