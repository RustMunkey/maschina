import { get, set } from "@maschina/cache";
import { Subjects } from "@maschina/events";
import { publishSafe } from "@maschina/nats";
import { type PlanTier, getPlan } from "@maschina/plans";
import { alertFiredKey } from "./keys.js";
import { getCurrentPeriod } from "./period.js";
import { checkQuota } from "./quota.js";
import type { UsageEventType } from "./types.js";

// ─── Quota threshold alert firing ─────────────────────────────────────────────
// Called fire-and-forget after every usage increment.
// Publishes QuotaWarning at ≥80% and QuotaExceeded at ≥100%, once per period.
// Dedup is handled by a Redis flag that expires when the quota period resets.

const WARNING_THRESHOLD = 80;

async function hasAlertFired(
  userId: string,
  type: UsageEventType,
  period: string,
  level: "warning" | "exceeded",
): Promise<boolean> {
  const val = await get(alertFiredKey(userId, type, period, level));
  return val !== null;
}

async function markAlertFired(
  userId: string,
  type: UsageEventType,
  period: string,
  level: "warning" | "exceeded",
  ttlSeconds: number,
): Promise<void> {
  await set(alertFiredKey(userId, type, period, level), "1", ttlSeconds);
}

export async function maybeFireQuotaAlerts(
  userId: string,
  tier: PlanTier,
  type: UsageEventType,
): Promise<void> {
  const plan = getPlan(tier);

  // Skip storage ops and unlimited plans — no threshold to alert on
  if (type === "storage_read" || type === "storage_write") return;

  const period = getCurrentPeriod();
  const result = await checkQuota(userId, tier, type);

  if (result.limit === -1) return; // unlimited tier

  const ttl = Math.ceil((new Date(result.resetsAt).getTime() - Date.now()) / 1000);

  if (result.percentageUsed >= 100) {
    const alreadyFired = await hasAlertFired(userId, type, period.key, "exceeded");
    if (!alreadyFired) {
      await markAlertFired(userId, type, period.key, "exceeded", ttl);
      publishSafe(Subjects.QuotaExceeded, {
        userId,
        quotaType: type,
        used: result.used,
        limit: result.limit,
        resetsAt: result.resetsAt,
      });
    }
  } else if (result.percentageUsed >= WARNING_THRESHOLD) {
    const alreadyFired = await hasAlertFired(userId, type, period.key, "warning");
    if (!alreadyFired) {
      await markAlertFired(userId, type, period.key, "warning", ttl);
      publishSafe(Subjects.QuotaWarning, {
        userId,
        quotaType: type,
        used: result.used,
        limit: result.limit,
        percentageUsed: result.percentageUsed,
        resetsAt: result.resetsAt,
      });
    }
  }

  void plan; // referenced for future custom threshold support
}
