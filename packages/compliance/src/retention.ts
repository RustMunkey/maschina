import type { PlanTier } from "@maschina/plans";

// Retention windows per tier in days. -1 = unlimited.
const RETENTION_DAYS: Record<PlanTier, number> = {
  access: 30,
  m1: 90,
  m5: 365,
  m10: -1,
  teams: -1,
  enterprise: -1,
  internal: -1,
};

/**
 * Returns the audit log / run data retention window for a tier in days.
 * Returns -1 for unlimited retention.
 */
export function getRetentionDays(tier: PlanTier): number {
  return RETENTION_DAYS[tier] ?? 30;
}

/**
 * Returns the cutoff Date before which records may be purged, or null if unlimited.
 */
export function getRetentionCutoff(tier: PlanTier): Date | null {
  const days = getRetentionDays(tier);
  if (days === -1) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}
