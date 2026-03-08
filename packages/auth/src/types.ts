export type UserRole = "owner" | "admin" | "member" | "viewer";
export type PlanTier = "access" | "m1" | "m5" | "m10" | "teams" | "enterprise" | "internal";
export type AuthMethod = "jwt" | "api_key";
export type KeyEnvironment = "live" | "test";

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: UserRole;
  plan: PlanTier;
  orgId?: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string; // userId
  sessionId: string;
  iat?: number;
  exp?: number;
}

// Resolved auth context — attached to every authenticated request
export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
  plan: PlanTier;
  orgId?: string;
  method: AuthMethod;
  apiKeyId?: string;
  sessionId?: string;
}

export interface ApiKeyValidation {
  valid: boolean;
  apiKeyId?: string;
  userId?: string;
  reason?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface PasswordValidation {
  valid: boolean;
  reason?: string;
}
