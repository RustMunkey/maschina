import { reconcileAllUsers } from "@maschina/usage";

// ─── Nightly usage reconciliation ─────────────────────────────────────────────
// Syncs Redis quota counters → PostgreSQL usage_rollups.
// Run this on a cron: "0 2 * * *" (2am UTC daily).
// Safe to run multiple times — fully idempotent.

export async function runReconciliation(): Promise<void> {
  console.log("[reconcile] Starting nightly usage reconciliation...");
  const start = Date.now();

  try {
    const { usersProcessed } = await reconcileAllUsers();
    const duration = Date.now() - start;
    console.log(`[reconcile] Done. Processed ${usersProcessed} users in ${duration}ms.`);
  } catch (err) {
    console.error("[reconcile] Failed:", err);
    throw err;
  }
}

// Standalone runner — called when this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runReconciliation()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
