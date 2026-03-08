import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  compareApiKeyHash,
  isValidKeyFormat,
  parseKeyEnvironment,
} from "../api-key.js";

describe("generateApiKey", () => {
  it("generates a live key with correct prefix", () => {
    const { key, hash, prefix } = generateApiKey("live");
    expect(key).toMatch(/^msk_live_/);
    expect(hash).toBeTruthy();
    expect(prefix).toContain("msk_live_");
  });

  it("generates a test key with correct prefix", () => {
    const { key } = generateApiKey("test");
    expect(key).toMatch(/^msk_test_/);
  });

  it("generates unique keys", () => {
    const { key: k1 } = generateApiKey();
    const { key: k2 } = generateApiKey();
    expect(k1).not.toBe(k2);
  });

  it("hash is deterministic for the same key", () => {
    const { key } = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });
});

describe("compareApiKeyHash", () => {
  it("returns true for matching key and hash", () => {
    const { key, hash } = generateApiKey();
    expect(compareApiKeyHash(key, hash)).toBe(true);
  });

  it("returns false for wrong key", () => {
    const { hash } = generateApiKey();
    const { key: otherKey } = generateApiKey();
    expect(compareApiKeyHash(otherKey, hash)).toBe(false);
  });
});

describe("isValidKeyFormat", () => {
  it("accepts valid live keys", () => {
    const { key } = generateApiKey("live");
    expect(isValidKeyFormat(key)).toBe(true);
  });

  it("rejects random strings", () => {
    expect(isValidKeyFormat("random-garbage")).toBe(false);
    expect(isValidKeyFormat("")).toBe(false);
  });
});

describe("parseKeyEnvironment", () => {
  it("detects live keys", () => {
    const { key } = generateApiKey("live");
    expect(parseKeyEnvironment(key)).toBe("live");
  });

  it("detects test keys", () => {
    const { key } = generateApiKey("test");
    expect(parseKeyEnvironment(key)).toBe("test");
  });

  it("returns null for invalid keys", () => {
    expect(parseKeyEnvironment("invalid")).toBeNull();
  });
});
