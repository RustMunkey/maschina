export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export class InvalidTokenError extends AuthError {
  constructor(message = "Invalid or expired token") {
    super(message, "INVALID_TOKEN", 401);
  }
}

export class InvalidApiKeyError extends AuthError {
  constructor(message = "Invalid API key") {
    super(message, "INVALID_API_KEY", 401);
  }
}

export class ApiKeyExpiredError extends AuthError {
  constructor() {
    super("API key has expired", "API_KEY_EXPIRED", 401);
  }
}

export class ApiKeyRevokedError extends AuthError {
  constructor() {
    super("API key has been revoked", "API_KEY_REVOKED", 401);
  }
}

export class QuotaExceededError extends AuthError {
  constructor() {
    super("API quota exceeded", "QUOTA_EXCEEDED", 429);
  }
}

export class InsufficientRoleError extends AuthError {
  constructor(required: string) {
    super(`Required role: ${required}`, "INSUFFICIENT_ROLE", 403);
  }
}

export class SessionExpiredError extends AuthError {
  constructor() {
    super("Session has expired", "SESSION_EXPIRED", 401);
  }
}
