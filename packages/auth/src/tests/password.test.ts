import { describe, expect, it } from "vitest";
import {
  hashPassword,
  needsRehash,
  validatePasswordStrength,
  verifyPassword,
} from "../password.js";

describe("hashPassword / verifyPassword", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("Secure@Password1");
    expect(typeof hash).toBe("string");
    expect(hash).not.toBe("Secure@Password1");

    const valid = await verifyPassword(hash, "Secure@Password1");
    expect(valid).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("Secure@Password1");
    const valid = await verifyPassword(hash, "WrongPassword1!");
    expect(valid).toBe(false);
  });

  it("produces different hashes for the same input (salted)", async () => {
    const hash1 = await hashPassword("Secure@Password1");
    const hash2 = await hashPassword("Secure@Password1");
    expect(hash1).not.toBe(hash2);
  });
});

describe("validatePasswordStrength", () => {
  it("accepts strong passwords", () => {
    expect(validatePasswordStrength("Secure@Password1").valid).toBe(true);
  });

  it("rejects short passwords", () => {
    const result = validatePasswordStrength("Ab1!");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/8 characters/);
  });

  it("rejects passwords without uppercase", () => {
    expect(validatePasswordStrength("secure@password1").valid).toBe(false);
  });

  it("rejects passwords without numbers", () => {
    expect(validatePasswordStrength("Secure@Password").valid).toBe(false);
  });

  it("rejects passwords without special characters", () => {
    expect(validatePasswordStrength("SecurePassword1").valid).toBe(false);
  });
});
