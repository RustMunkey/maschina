// ─── Output projection ────────────────────────────────────────────────────────
// Never return raw DB rows to API consumers.
// These helpers explicitly pick safe fields — security by explicit inclusion.

// ─── User ─────────────────────────────────────────────────────────────────────

export interface PublicUser {
  id: string;
  email: string; // decrypted; never the raw encrypted bytes or emailIndex
  name: string | null;
  avatarUrl: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: Date;
}

export function projectUser(row: {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  // fields we deliberately omit:
  // emailIndex, passwordHash (in user_passwords), licenseToken,
  // deletedAt, encryptedAt, keyVersion, updatedAt
}): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    role: row.role,
    emailVerified: row.emailVerifiedAt !== null,
    createdAt: row.createdAt,
  };
}

// ─── API Key ──────────────────────────────────────────────────────────────────

export interface PublicApiKey {
  id: string;
  name: string;
  keyPrefix: string; // e.g. "msk_live_abc123" — first 12 chars only
  monthlyLimit: number | null;
  usageCount: number;
  lastUsedAt: Date | null;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

export function projectApiKey(row: {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string; // NEVER exposed
  monthlyLimit: number | null;
  usageCount: number;
  lastUsedAt: Date | null;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}): PublicApiKey {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    monthlyLimit: row.monthlyLimit,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt,
    isActive: row.isActive,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface PublicSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null; // may be null if encrypted and caller lacks decrypt permission
  expiresAt: Date;
  createdAt: Date;
  isCurrent: boolean;
}

export function projectSession(
  row: {
    id: string;
    tokenHash: string; // NEVER exposed
    userAgent: string | null;
    ipAddress: string | null;
    expiresAt: Date;
    createdAt: Date;
  },
  currentSessionId: string,
): PublicSession {
  return {
    id: row.id,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    isCurrent: row.id === currentSessionId,
  };
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export interface PublicAgent {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function projectAgent(row: {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  version: number;
  config: unknown; // encrypted in DB — only expose if caller has permission
  configIv: string | null; // NEVER exposed
  resultStorageKey: string | null; // internal S3 key, NEVER exposed
  createdAt: Date;
  updatedAt: Date;
}): PublicAgent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Subscription / Plan ──────────────────────────────────────────────────────

export interface PublicSubscription {
  planName: string;
  tier: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export function projectSubscription(row: {
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null; // NEVER exposed
  stripeCustomerId: string | null; // NEVER exposed
  plan: { name: string; tier: string };
}): PublicSubscription {
  return {
    planName: row.plan.name,
    tier: row.plan.tier,
    status: row.status,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
  };
}
