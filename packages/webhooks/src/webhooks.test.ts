import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, buildPayload, nextRetryDelay } from "./deliver.js";
import { generateSecret, hashSecret, signPayload, verifySignature } from "./sign.js";

// ─── generateSecret ───────────────────────────────────────────────────────────

describe("generateSecret", () => {
  it("returns a 64-char hex string (32 bytes)", () => {
    const secret = generateSecret();
    expect(secret).toHaveLength(64);
    expect(secret).toMatch(/^[0-9a-f]+$/);
  });

  it("generates unique secrets each call", () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});

// ─── hashSecret ──────────────────────────────────────────────────────────────

describe("hashSecret", () => {
  it("returns a deterministic HMAC-SHA256 hex string", () => {
    const hash1 = hashSecret("my-secret", "app-key");
    const hash2 = hashSecret("my-secret", "app-key");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).toMatch(/^[0-9a-f]+$/);
  });

  it("produces different hashes for different secrets", () => {
    expect(hashSecret("secret-a", "app-key")).not.toBe(hashSecret("secret-b", "app-key"));
  });

  it("produces different hashes for different app keys", () => {
    expect(hashSecret("secret", "key-a")).not.toBe(hashSecret("secret", "key-b"));
  });
});

// ─── signPayload ──────────────────────────────────────────────────────────────

describe("signPayload", () => {
  it("returns sha256=<hex> format", () => {
    const sig = signPayload('{"foo":"bar"}', "secret");
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("matches manual HMAC-SHA256", () => {
    const payload = '{"run_id":"abc"}';
    const secret = "test-secret";
    const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
    expect(signPayload(payload, secret)).toBe(expected);
  });

  it("is deterministic for same inputs", () => {
    const sig1 = signPayload("payload", "secret");
    const sig2 = signPayload("payload", "secret");
    expect(sig1).toBe(sig2);
  });

  it("differs for different payloads", () => {
    expect(signPayload("payload-a", "secret")).not.toBe(signPayload("payload-b", "secret"));
  });

  it("differs for different secrets", () => {
    expect(signPayload("payload", "secret-a")).not.toBe(signPayload("payload", "secret-b"));
  });
});

// ─── verifySignature ─────────────────────────────────────────────────────────

describe("verifySignature", () => {
  it("returns true for a valid signature", () => {
    const payload = '{"event":"agent.run.completed"}';
    const secret = "webhook-secret";
    const header = signPayload(payload, secret);
    expect(verifySignature(payload, secret, header)).toBe(true);
  });

  it("returns false for a tampered payload", () => {
    const secret = "webhook-secret";
    const header = signPayload('{"original":"payload"}', secret);
    expect(verifySignature('{"tampered":"payload"}', secret, header)).toBe(false);
  });

  it("returns false for a wrong secret", () => {
    const payload = "payload";
    const header = signPayload(payload, "correct-secret");
    expect(verifySignature(payload, "wrong-secret", header)).toBe(false);
  });

  it("returns false for a malformed header (length mismatch)", () => {
    expect(verifySignature("payload", "secret", "sha256=short")).toBe(false);
  });
});

// ─── nextRetryDelay ───────────────────────────────────────────────────────────

describe("nextRetryDelay", () => {
  it("returns null when attempt >= MAX_ATTEMPTS", () => {
    expect(nextRetryDelay(MAX_ATTEMPTS)).toBeNull();
    expect(nextRetryDelay(MAX_ATTEMPTS + 1)).toBeNull();
  });

  it("returns increasing delays for attempts 1-4", () => {
    const delays = [1, 2, 3, 4].map((a) => nextRetryDelay(a));
    for (let i = 0; i < delays.length - 1; i++) {
      const curr = delays[i];
      const next = delays[i + 1];
      if (curr != null && next != null) {
        expect(next).toBeGreaterThan(curr);
      }
    }
  });

  it("first retry delay is 10 seconds", () => {
    expect(nextRetryDelay(1)).toBe(10_000);
  });

  it("second retry delay is 30 seconds", () => {
    expect(nextRetryDelay(2)).toBe(30_000);
  });

  it("third retry delay is 90 seconds", () => {
    expect(nextRetryDelay(3)).toBe(90_000);
  });
});

// ─── buildPayload ─────────────────────────────────────────────────────────────

describe("buildPayload", () => {
  it("builds a valid webhook payload", () => {
    const payload = buildPayload(
      "agent.run.started",
      { run_id: "r1", agent_id: "a1", user_id: "u1", model: "claude-haiku-4-5-20251001" },
      "delivery-uuid-123",
    );

    expect(payload.id).toBe("delivery-uuid-123");
    expect(payload.type).toBe("agent.run.started");
    expect(payload.api_version).toBe("2026-03-13");
    expect(payload.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.data).toMatchObject({ run_id: "r1" });
  });

  it("sets created_at to a current ISO timestamp", () => {
    const before = Date.now();
    const payload = buildPayload(
      "agent.run.failed",
      { run_id: "r2", agent_id: "a2", user_id: "u2", error_code: "ERR", error_message: "fail" },
      "d2",
    );
    const after = Date.now();
    const ts = new Date(payload.created_at).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
