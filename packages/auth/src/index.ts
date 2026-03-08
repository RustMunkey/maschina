// Types
export type {
  AuthContext,
  AuthMethod,
  JwtPayload,
  KeyEnvironment,
  PasswordValidation,
  PlanTier,
  RefreshTokenPayload,
  TokenPair,
  UserRole,
} from "./types.js";

// Errors
export {
  AuthError,
  ApiKeyExpiredError,
  ApiKeyRevokedError,
  InsufficientRoleError,
  InvalidApiKeyError,
  InvalidTokenError,
  QuotaExceededError,
  SessionExpiredError,
} from "./errors.js";

// JWT
export {
  createAccessToken,
  createRefreshToken,
  createTokenPair,
  generateSecureToken,
  hashToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./jwt.js";

// Password
export {
  hashPassword,
  needsRehash,
  validatePasswordStrength,
  verifyPassword,
} from "./password.js";

// API keys
export {
  compareApiKeyHash,
  generateApiKey,
  hashApiKey,
  isValidKeyFormat,
  parseKeyEnvironment,
} from "./api-key.js";

// Sessions
export {
  createSession,
  pruneExpiredSessions,
  revokeAllSessions,
  revokeSession,
  rotateSession,
} from "./session.js";

// Validation
export { resolveAuth, validateAccessToken, validateApiKey } from "./validate.js";

// RBAC
export {
  hasRole,
  hasPlan,
  planFeatures,
  requireAdmin,
  requireOwner,
  requireRole,
  requirePlan,
  requireSelfOrAdmin,
} from "./rbac.js";

// OAuth
export { upsertOAuthUser } from "./oauth.js";
export type { OAuthProfile, OAuthResult } from "./oauth.js";

// Verification
export {
  createEmailVerificationToken,
  createPasswordResetToken,
  resetPassword,
  verifyEmail,
} from "./verification.js";
