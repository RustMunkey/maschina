import { agentRuns, agents, db, users } from "@maschina/db";
import { and, eq, isNull, sql } from "@maschina/db";
import { appendAuditLog } from "./audit.js";

/**
 * GDPR Article 17 — Right to erasure.
 *
 * Anonymizes the user record and purges run payloads. Does NOT hard-delete
 * the user row (we need the tombstone for billing reconciliation and to prevent
 * re-registration with the same email index).
 */
export async function deleteUserData(userId: string): Promise<{
  agentsDeleted: number;
  runsAnonymized: number;
}> {
  // 1. Soft-delete all agents
  const deletedAgents = await db
    .update(agents)
    .set({ deletedAt: new Date(), status: "stopped" })
    .where(and(eq(agents.userId, userId), isNull(agents.deletedAt)))
    .returning({ id: agents.id });

  // 2. Anonymize run payloads (zero out PII-bearing fields)
  const anonymizedRuns = await db
    .update(agentRuns)
    .set({
      inputPayload: {},
      outputPayload: {},
    })
    .where(eq(agentRuns.userId, userId))
    .returning({ id: agentRuns.id });

  // 3. Anonymize the user row — preserve ID + tier for billing tombstone
  await db
    .update(users)
    .set({
      email: `deleted+${userId}@maschina.internal`,
      emailIndex: `deleted:${userId}`,
      name: "Deleted User",
      passwordHash: "",
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // 4. Audit log — immutable record that the deletion happened
  await appendAuditLog({
    userId: null, // user is now anonymized
    action: "gdpr.delete",
    resource: "user",
    resourceId: userId,
    metadata: {
      agentsDeleted: deletedAgents.length,
      runsAnonymized: anonymizedRuns.length,
    },
  });

  return {
    agentsDeleted: deletedAgents.length,
    runsAnonymized: anonymizedRuns.length,
  };
}
