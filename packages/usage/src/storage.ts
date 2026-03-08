import { db } from "@maschina/db";
import { files } from "@maschina/db";
import { eq, sql } from "@maschina/db";
import { getPlan, type PlanTier } from "@maschina/plans";

// ─── Storage quota ────────────────────────────────────────────────────────────
// Storage is a snapshot, not a counter — it's the sum of all files currently
// stored, not a running total. Can go up AND down (files deleted).
// No Redis needed — queried directly from PostgreSQL files table.
// Called before file uploads only, not on every request.

const BYTES_PER_GB = 1024 ** 3;

export async function getStorageUsageBytes(userId: string): Promise<number> {
  const [result] = await db
    .select({ totalBytes: sql<number>`COALESCE(SUM(${files.sizeBytes}), 0)` })
    .from(files)
    .where(eq(files.userId, userId));

  return result?.totalBytes ?? 0;
}

export async function getStorageUsageGb(userId: string): Promise<number> {
  const bytes = await getStorageUsageBytes(userId);
  return bytes / BYTES_PER_GB;
}

export interface StorageQuotaResult {
  allowed: boolean;
  usedBytes: number;
  usedGb: number;
  limitGb: number;     // -1 = unlimited
  remainingGb: number; // -1 = unlimited
  percentageUsed: number;
}

export async function checkStorageQuota(
  userId: string,
  tier: PlanTier,
  additionalBytes: number,
): Promise<StorageQuotaResult> {
  const limitGb = getPlan(tier).storageGb;
  const usedBytes = await getStorageUsageBytes(userId);
  const usedGb = usedBytes / BYTES_PER_GB;

  if (limitGb === -1) {
    return {
      allowed: true,
      usedBytes,
      usedGb,
      limitGb: -1,
      remainingGb: -1,
      percentageUsed: 0,
    };
  }

  const additionalGb = additionalBytes / BYTES_PER_GB;
  const limitBytes = limitGb * BYTES_PER_GB;
  const remainingGb = Math.max(0, limitGb - usedGb);
  const percentageUsed = Math.round((usedBytes / limitBytes) * 100);

  return {
    allowed: usedBytes + additionalBytes <= limitBytes,
    usedBytes,
    usedGb,
    limitGb,
    remainingGb,
    percentageUsed,
  };
}
