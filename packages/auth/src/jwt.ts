import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { InvalidTokenError } from "./errors.js";
import type { JwtPayload, RefreshTokenPayload, TokenPair } from "./types.js";

const ACCESS_TOKEN_EXPIRY = "15m";
const ACCESS_TOKEN_EXPIRY_SECONDS = 60 * 15;
const REFRESH_TOKEN_EXPIRY = "30d";
const ISSUER = "maschina";
const AUDIENCE = "maschina:api";

function jwtSecret(): Uint8Array {
  const secret = process.env["JWT_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

function refreshSecret(): Uint8Array {
  const secret = process.env["JWT_REFRESH_SECRET"] ?? process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_REFRESH_SECRET is not set");
  return new TextEncoder().encode(secret + ":refresh");
}

// ─── Access tokens ────────────────────────────────────────────────────────────

export async function createAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(jwtSecret());
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload as unknown as JwtPayload;
  } catch {
    throw new InvalidTokenError();
  }
}

// ─── Refresh tokens ───────────────────────────────────────────────────────────

export async function createRefreshToken(
  userId: string,
  sessionId: string,
): Promise<{ token: string; hash: string }> {
  const token = await new SignJWT({ sub: userId, sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .setIssuer(ISSUER)
    .sign(refreshSecret());

  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret(), { issuer: ISSUER });
    return payload as unknown as RefreshTokenPayload;
  } catch {
    throw new InvalidTokenError("Invalid or expired refresh token");
  }
}

// ─── Token pair ───────────────────────────────────────────────────────────────

export async function createTokenPair(
  payload: Omit<JwtPayload, "iat" | "exp">,
  sessionId: string,
): Promise<TokenPair & { refreshTokenHash: string }> {
  const [accessToken, { token: refreshToken, hash: refreshTokenHash }] = await Promise.all([
    createAccessToken(payload),
    createRefreshToken(payload.sub, sessionId),
  ]);

  return {
    accessToken,
    refreshToken,
    refreshTokenHash,
    expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
