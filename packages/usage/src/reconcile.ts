import { db } from "@maschina/db";
import { usageEvents, usageRollups } from "@maschina/db";
import { get } from "@maschina/cache";
import { and, eq, gte, lt, sql } from "@maschina/db";
import { getCurrentPeriod, getPeriodForDate } from "./period.js";
import { quotaKey } from "./keys.js";
import type { UsageEventType } from "./types.js";

// ─── Nightly reconciliation ───────────────────────────────────────────────────
// Syncs Redis quota counters → PostgreSQL usage_rollups.
// Provides durable checkpoint for:
//   - Billing reconciliation
//   - Dashboard queries (avoids scanning raw events)
//   - Redis cold-start hydration after flushes or restarts
//
// Run this as a cron job in services/api or services/worker.
// Idempotent — safe to run multiple times.

const USAGE_TYPES: UsageEventType[] = [
  "agent_execution",
  "api_call",
  "model_inference",
  "storage_read",
  "storage_write",
];

/**
 * Reconcile a single user's usage for the current period.
 * Called by the nightly job for each active user.
 */
export async function reconcileUserUsage(
  userId: string,
  period = getCurrentPeriod(),
): Promise<void> {
  for (const type of USAGE_TYPES) {
    // Prefer Redis (real-time) — fall back to summing raw events if Redis is cold
    const redisKey = quotaKey(userId, type, period.key);
    const cached = await get(redisKey);

    let totalUnits: number;

    if (cached !== null) {
      totalUnits = parseInt(cached, 10);
    } else {
      // Redis cold — sum from raw events (slower but accurate)
      const [agg] = await db
        .select({ total: sql<number>`COALESCE(SUM(${usageEvents.units}), 0)` })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.userId, userId),
            eq(usageEvents.type, type),
            gte(usageEvents.createdAt, period.start),
            lt(usageEvents.createdAt, period.end),
          ),
        );
      totalUnits = agg?.total ?? 0;
    }

    // Upsert into rollup table — unique constraint on (userId, type, periodStart)
    await db
      .insert(usageRollups)
      .values({
        userId,
        type,
        periodStart: period.start,
        periodEnd:   period.end,
        totalUnits,
        updatedAt:   new Date(),
      })
      .onConflictDoUpdate({
        target: [usageRollups.userId, usageRollups.type, usageRollups.periodStart],
        set: {
          totalUnits,
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Reconcile all users who had usage events in the given period.
 * Designed to be called nightly from a cron job.
 */
export async function reconcileAllUsers(
  period = getCurrentPeriod(),
): Promise<{ usersProcessed: number }> {
  // Get distinct users who had events this period
  const activeUsers = await db
    .selectDistinct({ userId: usageEvents.userId })
    .from(usageEvents)
    .where(
      and(
        gte(usageEvents.createdAt, period.start),
        lt(usageEvents.createdAt, period.end),
      ),
    );

  for (const { userId } of activeUsers) {
    await reconcileUserUsage(userId, period);
  }

  return { usersProcessed: activeUsers.length };
}
