import { beforeAll, describe, expect, it } from "vitest";
import { InvalidTokenError } from "../errors.js";
import {
  createAccessToken,
  createRefreshToken,
  hashToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../jwt.js";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-chars-long!!";
});

describe("createAccessToken / verifyAccessToken", () => {
  it("creates and verifies a valid access token", async () => {
    const token = await createAccessToken({
      sub: "user-123",
      email: "ash@maschina.ai",
      role: "owner",
      plan: "m5",
    });

    expect(typeof token).toBe("string");

    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe("user-123");
    expect(payload.email).toBe("ash@maschina.ai");
    expect(payload.role).toBe("owner");
    expect(payload.plan).toBe("m5");
  });

  it("throws on invalid token", async () => {
    await expect(verifyAccessToken("not.a.token")).rejects.toThrow(InvalidTokenError);
  });

  it("throws on tampered token", async () => {
    const token = await createAccessToken({
      sub: "user-123",
      email: "ash@maschina.ai",
      role: "owner",
      plan: "access",
    });
    const tampered = `${token.slice(0, -5)}XXXXX`;
    await expect(verifyAccessToken(tampered)).rejects.toThrow(InvalidTokenError);
  });
});

describe("createRefreshToken", () => {
  it("creates a refresh token with consistent hash", async () => {
    const { token, hash } = await createRefreshToken("user-123", "session-456");
    expect(typeof token).toBe("string");
    expect(hash).toBe(hashToken(token));
  });
});
