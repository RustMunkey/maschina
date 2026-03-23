/**
 * Internal-only routes — not exposed through the public gateway.
 * Authenticated by a shared INTERNAL_SECRET header, not user JWTs.
 *
 * POST /internal/delegate     — synchronous agent-to-agent delegation
 * POST /internal/run-event    — realtime run status events from daemon
 * POST /internal/notify       — push/in-app notification dispatch from daemon
 * POST /internal/rotate-keys  — re-encrypt all rows with outdated keyVersion
 */
import {
  decryptFieldVersioned,
  decryptVersioned,
  encryptFieldVersioned,
  encryptVersioned,
  getActiveKeyVersion,
  isEncryptedField,
} from "@maschina/crypto";
import { agentRuns, agentSkills, agents, db, encryptionKeyVersions, users } from "@maschina/db";
import { and, eq, isNull, lt, ne } from "@maschina/db";
import { resolveModel } from "@maschina/model";
import { notifyAgentCompleted, notifyAgentFailed } from "@maschina/notifications";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "";
const RUNTIME_URL = process.env.RUNTIME_URL ?? "http://localhost:8001";

const app = new Hono();

// ─── Internal auth middleware ─────────────────────────────────────────────────

app.use("*", async (c, next) => {
  if (!INTERNAL_SECRET) {
    throw new HTTPException(503, { message: "Internal routes not configured" });
  }
  const secret = c.req.header("X-Internal-Secret");
  if (secret !== INTERNAL_SECRET) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  await next();
});

// ─── POST /internal/delegate ─────────────────────────────────────────────────
// Synchronous agent delegation: fetches target agent config, calls runtime
// directly (bypassing NATS), returns the result to the calling agent.

app.post("/delegate", async (c) => {
  const body = await c.req.json().catch(() => null);
  const { agent_id, message, caller_agent_id, user_id } = (body ?? {}) as Record<string, string>;

  if (!agent_id || !message || !user_id) {
    throw new HTTPException(400, { message: "agent_id, message, and user_id are required" });
  }

  // Fetch target agent — must belong to the same user
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agent_id), eq(agents.userId, user_id), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw new HTTPException(404, { message: "Agent not found" });
  if (agent.status === "stopped") {
    throw new HTTPException(409, { message: "Target agent is stopped" });
  }

  // Resolve model and system prompt from agent config
  const agentConfig = (agent.config ?? {}) as Record<string, unknown>;
  const model = resolveModel(
    "access",
    typeof agentConfig.model === "string" ? agentConfig.model : undefined,
  );
  const systemPrompt =
    typeof agentConfig.systemPrompt === "string"
      ? agentConfig.systemPrompt
      : `You are a Maschina ${agent.type} agent named "${agent.name}". Complete the task provided.`;

  // Fetch enabled skills for target agent
  const skillRows = await db
    .select({ skillName: agentSkills.skillName, config: agentSkills.config })
    .from(agentSkills)
    .where(and(eq(agentSkills.agentId, agent_id), eq(agentSkills.enabled, true)));

  const skills = skillRows.map((r: { skillName: string; config: unknown }) => r.skillName);
  const skillConfigs = Object.fromEntries(
    skillRows.map((r: { skillName: string; config: unknown }) => [r.skillName, r.config]),
  );

  // Generate a delegation run ID (not persisted to agent_runs — delegation is ephemeral)
  const { randomUUID } = await import("node:crypto");
  const runId = randomUUID();

  // Call the runtime synchronously
  let response: Response;
  try {
    response = await fetch(`${RUNTIME_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: runId,
        agent_id,
        user_id,
        plan_tier: "access",
        model,
        system_prompt: systemPrompt,
        max_tokens: 4096,
        input_payload: { message },
        timeout_secs: 120,
        skills,
        skill_configs: skillConfigs,
      }),
      signal: AbortSignal.timeout(130_000),
    });
  } catch (err) {
    throw new HTTPException(502, { message: `Runtime unreachable: ${String(err).slice(0, 200)}` });
  }

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new HTTPException(502, { message: `Runtime error: ${err.slice(0, 300)}` });
  }

  const result = (await response.json()) as { output_payload?: { text?: string } };
  const output = result.output_payload?.text ?? "";

  return c.json({ runId, agentId: agent_id, callerAgentId: caller_agent_id ?? null, output });
});

// ─── POST /internal/notify ───────────────────────────────────────────────────
// Push + in-app notification dispatch. Called by daemon after run completion.

app.post("/notify", async (c) => {
  const body = await c.req.json().catch(() => null);
  const {
    userId,
    runId,
    agentId,
    type: notifType,
    durationMs,
    errorCode,
  } = (body ?? {}) as Record<string, string>;

  if (!userId || !runId || !agentId || !notifType) {
    throw new HTTPException(400, { message: "userId, runId, agentId, and type are required" });
  }

  const [agent] = await db
    .select({ name: agents.name })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  const agentName = agent?.name ?? "Agent";

  if (notifType === "completed") {
    await notifyAgentCompleted({
      userId,
      runId,
      agentId,
      agentName,
      durationMs: Number(durationMs ?? 0),
    });
  } else if (notifType === "failed") {
    await notifyAgentFailed({
      userId,
      runId,
      agentId,
      agentName,
      errorCode: errorCode ?? "unknown_error",
    });
  }

  return c.json({ ok: true });
});

// ─── POST /internal/rotate-keys ──────────────────────────────────────────────
// Re-encrypts all rows whose keyVersion < ACTIVE_KEY_VERSION using the new key.
// Safe to run multiple times — skips rows already at the active version.
// Run this after adding DATA_ENCRYPTION_KEY_V{n} and setting ACTIVE_KEY_VERSION={n}.

app.post("/rotate-keys", async (c) => {
  const targetVersion = getActiveKeyVersion();

  // Record the new key version in the tracking table (idempotent)
  await db
    .insert(encryptionKeyVersions)
    .values({
      version: targetVersion,
      algorithm: "AES-256-GCM",
      description: `Key version ${targetVersion}`,
      isActive: true,
      activatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: encryptionKeyVersions.version,
      set: { isActive: true, activatedAt: new Date() },
    });

  // Deactivate all other versions
  await db
    .update(encryptionKeyVersions)
    .set({ isActive: false, retiredAt: new Date() })
    .where(ne(encryptionKeyVersions.version, targetVersion));

  let rotatedAgents = 0;
  let rotatedRuns = 0;
  let rotatedUsers = 0;

  // ── Rotate agents.config ──────────────────────────────────────────────────
  const staleAgents = await db
    .select({
      id: agents.id,
      config: agents.config,
      configIv: agents.configIv,
      keyVersion: agents.keyVersion,
    })
    .from(agents)
    .where(and(isNull(agents.deletedAt), lt(agents.keyVersion, targetVersion)));

  for (const row of staleAgents) {
    if (!row.configIv || typeof row.config !== "string") continue;
    try {
      const plaintext = decryptVersioned(row.config, row.configIv, row.keyVersion);
      const { ciphertext, iv, version } = encryptVersioned(plaintext);
      await db
        .update(agents)
        .set({ config: ciphertext, configIv: iv, keyVersion: version, updatedAt: new Date() })
        .where(eq(agents.id, row.id));
      rotatedAgents++;
    } catch {
      // Skip rows that fail to decrypt — log and continue
      console.warn(`[rotate-keys] Failed to re-encrypt agent ${row.id}`);
    }
  }

  // ── Rotate agentRuns.inputPayload + outputPayload ─────────────────────────
  const staleRuns = await db
    .select({
      id: agentRuns.id,
      inputPayload: agentRuns.inputPayload,
      inputPayloadIv: agentRuns.inputPayloadIv,
      outputPayload: agentRuns.outputPayload,
      outputPayloadIv: agentRuns.outputPayloadIv,
      keyVersion: agentRuns.keyVersion,
    })
    .from(agentRuns)
    .where(lt(agentRuns.keyVersion, targetVersion));

  for (const row of staleRuns) {
    const updates: Record<string, unknown> = { keyVersion: targetVersion };
    let changed = false;

    if (row.inputPayloadIv && typeof row.inputPayload === "string") {
      try {
        const plaintext = decryptVersioned(row.inputPayload, row.inputPayloadIv, row.keyVersion);
        const { ciphertext, iv } = encryptVersioned(plaintext);
        updates.inputPayload = ciphertext;
        updates.inputPayloadIv = iv;
        changed = true;
      } catch {
        console.warn(`[rotate-keys] Failed to re-encrypt run ${row.id} inputPayload`);
      }
    }

    if (row.outputPayloadIv && typeof row.outputPayload === "string") {
      try {
        const plaintext = decryptVersioned(row.outputPayload, row.outputPayloadIv, row.keyVersion);
        const { ciphertext, iv } = encryptVersioned(plaintext);
        updates.outputPayload = ciphertext;
        updates.outputPayloadIv = iv;
        changed = true;
      } catch {
        console.warn(`[rotate-keys] Failed to re-encrypt run ${row.id} outputPayload`);
      }
    }

    if (changed) {
      await db.update(agentRuns).set(updates).where(eq(agentRuns.id, row.id));
      rotatedRuns++;
    }
  }

  // ── Rotate users.email + users.name ──────────────────────────────────────
  const staleUsers = await db
    .select({ id: users.id, email: users.email, name: users.name, keyVersion: users.keyVersion })
    .from(users)
    .where(and(isNull(users.deletedAt), lt(users.keyVersion, targetVersion)));

  for (const row of staleUsers) {
    const updates: Record<string, unknown> = { keyVersion: targetVersion };

    if (isEncryptedField(row.email)) {
      try {
        const plainEmail = decryptFieldVersioned(row.email);
        updates.email = encryptFieldVersioned(plainEmail);
      } catch {
        console.warn(`[rotate-keys] Failed to re-encrypt user ${row.id} email`);
      }
    }

    if (row.name && isEncryptedField(row.name)) {
      try {
        const plainName = decryptFieldVersioned(row.name);
        updates.name = encryptFieldVersioned(plainName);
      } catch {
        console.warn(`[rotate-keys] Failed to re-encrypt user ${row.id} name`);
      }
    }

    await db.update(users).set(updates).where(eq(users.id, row.id));
    rotatedUsers++;
  }

  return c.json({
    ok: true,
    targetVersion,
    rotated: { agents: rotatedAgents, runs: rotatedRuns, users: rotatedUsers },
  });
});

export default app;
