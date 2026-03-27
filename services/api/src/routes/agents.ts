import { decryptVersioned, encryptVersioned } from "@maschina/crypto";
import { db } from "@maschina/db";
import { type AgentRun, agentRuns, agents } from "@maschina/db";
import { and, desc, eq, isNull } from "@maschina/db";
import { Subjects } from "@maschina/events";
import { dispatchAgentRun } from "@maschina/jobs";
import { resolveModel, validateModelAccess } from "@maschina/model";
import { publishSafe } from "@maschina/nats";
import { deleteDocument, upsertDocument } from "@maschina/search";
import { recordAgentExecution } from "@maschina/usage";
import {
  CreateAgentSchema,
  RunAgentSchema,
  UpdateAgentSchema,
  assertValid,
  projectAgent,
  sanitizeText,
} from "@maschina/validation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import type { Variables } from "../context.js";
import { requireAuth, requireFeature } from "../middleware/auth.js";
import { requireQuota, trackApiCall } from "../middleware/quota.js";

// Encrypt agent config JSON using the active key version.
// Returns null iv/keyVersion when DATA_ENCRYPTION_KEY is not set (local dev without key).
function encryptConfig(config: unknown): {
  encryptedConfig: unknown;
  configIv: string | null;
  keyVersion: number;
} {
  try {
    const { ciphertext, iv, version } = encryptVersioned(JSON.stringify(config));
    return { encryptedConfig: ciphertext, configIv: iv, keyVersion: version };
  } catch {
    // DATA_ENCRYPTION_KEY not set — store plaintext (local dev only)
    return { encryptedConfig: config, configIv: null, keyVersion: 1 };
  }
}

// Decrypt agent config. Returns raw config when iv is null (unencrypted/local dev).
function decryptConfig(raw: unknown, iv: string | null, keyVersion = 1): Record<string, unknown> {
  if (!iv || typeof raw !== "string") return (raw ?? {}) as Record<string, unknown>;
  try {
    return JSON.parse(decryptVersioned(raw, iv, keyVersion)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function agentToDoc(agent: typeof agents.$inferSelect) {
  const config = decryptConfig(agent.config, agent.configIv, agent.keyVersion);
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description ?? "",
    type: agent.type,
    status: agent.status,
    model: typeof config.model === "string" ? config.model : "claude-haiku-4-5",
    systemPrompt: typeof config.systemPrompt === "string" ? config.systemPrompt : "",
    userId: agent.userId,
    createdAt: agent.createdAt.toISOString(),
  };
}

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth, trackApiCall);

// GET /agents
app.get("/", async (c) => {
  const { id } = c.get("user");

  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.userId, id), isNull(agents.deletedAt)));

  return c.json(rows.map(projectAgent));
});

// POST /agents
app.post("/", requireQuota("agent_execution", 0), async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const input = assertValid(CreateAgentSchema, body);

  // Check agent count limit
  const { getPlan } = await import("@maschina/plans");
  const plan = getPlan(user.tier);
  if (plan.maxAgents !== -1) {
    const [{ count }] = await db
      .select({
        count: db.$count(agents, and(eq(agents.userId, user.id), isNull(agents.deletedAt))),
      })
      .from(agents);
    if (Number(count) >= plan.maxAgents) {
      throw new HTTPException(403, {
        message: `Your plan allows a maximum of ${plan.maxAgents} agents. Upgrade to create more.`,
      });
    }
  }

  const { encryptedConfig, configIv, keyVersion } = encryptConfig(input.config ?? {});

  const [agent] = await db
    .insert(agents)
    .values({
      userId: user.id,
      name: sanitizeText(input.name),
      description: input.description ? sanitizeText(input.description) : null,
      type: input.type,
      status: "idle",
      config: encryptedConfig,
      configIv,
      keyVersion,
    })
    .returning();

  // Sync to search index (fire-and-forget)
  upsertDocument("agents", agentToDoc(agent)).catch((err) =>
    console.warn("[search] Failed to index agent on create:", err),
  );

  return c.json(projectAgent(agent), 201);
});

// GET /agents/:id
app.get("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const agentId = c.req.param("id");

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw new HTTPException(404, { message: "Agent not found" });

  return c.json(projectAgent(agent));
});

// PATCH /agents/:id
app.patch("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const agentId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const input = assertValid(UpdateAgentSchema, body);

  const updates: Partial<typeof agents.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = sanitizeText(input.name);
  if (input.description !== undefined) updates.description = sanitizeText(input.description);
  if (input.config !== undefined) {
    const { encryptedConfig, configIv, keyVersion } = encryptConfig(input.config);
    updates.config = encryptedConfig;
    updates.configIv = configIv;
    updates.keyVersion = keyVersion;
  }

  const [updated] = await db
    .update(agents)
    .set(updates)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId), isNull(agents.deletedAt)))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Agent not found" });

  // Sync to search index (fire-and-forget)
  upsertDocument("agents", agentToDoc(updated)).catch((err) =>
    console.warn("[search] Failed to update agent in index:", err),
  );

  return c.json(projectAgent(updated));
});

// DELETE /agents/:id
app.delete("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const agentId = c.req.param("id");

  const [deleted] = await db
    .update(agents)
    .set({ deletedAt: new Date(), status: "stopped" })
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId), isNull(agents.deletedAt)))
    .returning({ id: agents.id });

  if (!deleted) throw new HTTPException(404, { message: "Agent not found" });

  // Remove from search index (fire-and-forget)
  deleteDocument("agents", agentId).catch((err) =>
    console.warn("[search] Failed to remove agent from index:", err),
  );

  return c.json({ success: true });
});

// GET /agents/discover
// Lists agents available for delegation — same user, not deleted, not stopped.
// Intended to be called by an agent using DelegateAgentTool to find peers.
app.get("/discover", async (c) => {
  const { id: userId } = c.get("user");
  const type = c.req.query("type");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      type: agents.type,
      description: agents.description,
      reputationScore: agents.reputationScore,
      totalRunsCompleted: agents.totalRunsCompleted,
    })
    .from(agents)
    .where(
      and(
        eq(agents.userId, userId),
        isNull(agents.deletedAt),
        type ? eq(agents.type, type as (typeof agents.$inferSelect)["type"]) : undefined,
      ),
    )
    .limit(limit);

  return c.json(rows);
});

// POST /agents/:id/run
app.post(
  "/:id/run",
  requireFeature("useCloudExecution"),
  requireQuota("agent_execution"),
  async (c) => {
    const user = c.get("user");
    const agentId = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const input = assertValid(RunAgentSchema, body);

    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.userId, user.id), isNull(agents.deletedAt)))
      .limit(1);

    if (!agent) throw new HTTPException(404, { message: "Agent not found" });

    const agentConfig = decryptConfig(agent.config, agent.configIv, agent.keyVersion);

    // Model priority: request body → agent config → tier default
    const requestedModel =
      input.model ?? (typeof agentConfig.model === "string" ? agentConfig.model : undefined);

    if (requestedModel) {
      const access = validateModelAccess(user.tier, requestedModel);
      if (!access.allowed) {
        throw new HTTPException(403, {
          message: access.reason ?? "Model not available on your plan.",
        });
      }
    }
    const resolvedModel = resolveModel(user.tier, requestedModel);
    const systemPrompt =
      typeof agentConfig.systemPrompt === "string"
        ? agentConfig.systemPrompt
        : `You are a Maschina ${agent.type} agent named "${agent.name}". Complete the task provided.`;

    // Convert timeout from ms (API input) to seconds (runtime)
    const timeoutSecs = Math.floor((input.timeout ?? 300_000) / 1000);

    // Insert the agent_runs row — encrypt input payload at rest
    const {
      encryptedConfig: encryptedInput,
      configIv: inputPayloadIv,
      keyVersion: runKeyVersion,
    } = encryptConfig(input.input ?? {});
    const { agentRuns } = await import("@maschina/db");
    const [run] = await db
      .insert(agentRuns)
      .values({
        agentId,
        userId: user.id,
        status: "queued",
        inputPayload: encryptedInput,
        inputPayloadIv,
        keyVersion: runKeyVersion,
      })
      .returning({ id: agentRuns.id });

    // Dispatch job to NATS JetStream — daemon picks it up
    await dispatchAgentRun({
      runId: run.id,
      agentId,
      userId: user.id,
      tier: user.tier,
      model: resolvedModel,
      systemPrompt,
      inputPayload: input.input ?? {},
      timeoutSecs,
    });

    // Publish event (fire-and-forget — realtime service fans this out to WebSocket clients)
    publishSafe(Subjects.AgentRunQueued, {
      runId: run.id,
      agentId,
      userId: user.id,
      tier: user.tier,
    });

    // Record usage (fire-and-forget)
    recordAgentExecution({ userId: user.id, agentId, apiKeyId: user.apiKeyId }).catch(
      console.error,
    );

    return c.json(
      {
        success: true,
        runId: run.id,
        agentId,
        status: "queued",
        message: "Agent run queued. Connect to /realtime for live status updates.",
      },
      202,
    );
  },
);

// ── GET /agents/runs/:runId — flat run lookup (no agentId required) ──────────
// Used by `maschina logs <runId>`.

app.get("/runs/:runId", requireAuth, async (c) => {
  const user = c.get("user");
  const runId = c.req.param("runId");

  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.userId, user.id)))
    .limit(1);

  if (!run) throw new HTTPException(404, { message: "Run not found" });

  return c.json({
    id: run.id,
    agentId: run.agentId,
    status: run.status,
    inputPayload: decryptConfig(run.inputPayload, run.inputPayloadIv, run.keyVersion),
    outputPayload: run.outputPayload
      ? decryptConfig(run.outputPayload, run.outputPayloadIv, run.keyVersion)
      : null,
    inputTokens: run.inputTokens ?? null,
    outputTokens: run.outputTokens ?? null,
    errorCode: run.errorCode ?? null,
    errorMessage: run.errorMessage ?? null,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
  });
});

// ── GET /agents/:id/runs — paginated list ────────────────────────────────────

app.get("/:id/runs", requireAuth, async (c) => {
  const user = c.get("user");
  const agentId = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);

  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, user.id)))
    .limit(1);

  if (!agent) throw new HTTPException(404, { message: "Agent not found" });

  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.agentId, agentId), eq(agentRuns.userId, user.id)))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json(
    rows.map((run: AgentRun) => ({
      id: run.id,
      agentId: run.agentId,
      status: run.status,
      inputTokens: run.inputTokens ?? null,
      outputTokens: run.outputTokens ?? null,
      errorCode: run.errorCode ?? null,
      errorMessage: run.errorMessage ?? null,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
    })),
  );
});

// ── POST /agents/:id/runs/:runId/cancel ───────────────────────────────────────

app.post("/:id/runs/:runId/cancel", requireAuth, async (c) => {
  const user = c.get("user");
  const agentId = c.req.param("id");
  const runId = c.req.param("runId");

  const [run] = await db
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.id, runId), eq(agentRuns.agentId, agentId), eq(agentRuns.userId, user.id)),
    )
    .limit(1);

  if (!run) throw new HTTPException(404, { message: "Run not found" });
  if (run.status === "completed" || run.status === "canceled" || run.status === "failed") {
    throw new HTTPException(409, { message: `Run already in terminal state: ${run.status}` });
  }

  const [cancelled] = await db
    .update(agentRuns)
    .set({ status: "canceled", finishedAt: new Date() })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.userId, user.id)))
    .returning({ id: agentRuns.id, status: agentRuns.status });

  publishSafe(Subjects.AgentRunCancelled, {
    runId,
    agentId,
    userId: user.id,
  });

  return c.json(cancelled);
});

// ── GET /agents/:id/runs/:runId/events (SSE) ──────────────────────────────────
// Streams run status updates until a terminal state is reached.
// Events: run:update (status change) | run:complete (terminal, includes output)

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "error",
  "stopped",
  "timed_out",
  "canceled",
]);

app.get("/:id/runs/:runId/events", requireAuth, async (c) => {
  const user = c.get("user");
  const agentId = c.req.param("id");
  const runId = c.req.param("runId");

  const [initial] = await db
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.id, runId), eq(agentRuns.agentId, agentId), eq(agentRuns.userId, user.id)),
    )
    .limit(1);

  if (!initial) throw new HTTPException(404, { message: "Run not found" });

  return streamSSE(c, async (stream) => {
    let lastStatus = initial.status;

    const sendUpdate = async (run: typeof agentRuns.$inferSelect) => {
      await stream.writeSSE({
        data: JSON.stringify({ type: "run:update", runId: run.id, status: run.status }),
      });
    };

    const sendComplete = async (run: typeof agentRuns.$inferSelect) => {
      await stream.writeSSE({
        data: JSON.stringify({
          type: "run:complete",
          runId: run.id,
          status: run.status,
          outputPayload: run.outputPayload
            ? decryptConfig(run.outputPayload, run.outputPayloadIv, run.keyVersion)
            : null,
          inputTokens: run.inputTokens ?? null,
          outputTokens: run.outputTokens ?? null,
          errorCode: run.errorCode ?? null,
          errorMessage: run.errorMessage ?? null,
          startedAt: run.startedAt?.toISOString() ?? null,
          finishedAt: run.finishedAt?.toISOString() ?? null,
        }),
      });
    };

    // If already terminal, emit final event immediately and close
    if (TERMINAL_STATUSES.has(lastStatus)) {
      await sendComplete(initial);
      return;
    }

    // Poll DB every 250ms until terminal (max 10 min — daemon watchdog handles actual timeout)
    const pollStart = Date.now();
    const MAX_POLL_MS = 10 * 60 * 1000;

    while (true) {
      await new Promise<void>((resolve) => setTimeout(resolve, 250));

      if (stream.aborted) break;

      if (Date.now() - pollStart > MAX_POLL_MS) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "run:timeout",
            message: "SSE poll timeout — check run status directly",
          }),
        });
        break;
      }

      const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);

      if (!run) break;

      if (run.status !== lastStatus) {
        lastStatus = run.status;
        await sendUpdate(run);
      }

      if (TERMINAL_STATUSES.has(run.status)) {
        await sendComplete(run);
        break;
      }
    }
  });
});

// ── GET /agents/:id/runs/:runId ───────────────────────────────────────────────

app.get("/:id/runs/:runId", requireAuth, async (c) => {
  const user = c.get("user");
  const agentId = c.req.param("id");
  const runId = c.req.param("runId");

  const [run] = await db
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.id, runId), eq(agentRuns.agentId, agentId), eq(agentRuns.userId, user.id)),
    )
    .limit(1);

  if (!run) throw new HTTPException(404, { message: "Run not found" });

  return c.json({
    id: run.id,
    agentId: run.agentId,
    status: run.status,
    inputPayload: decryptConfig(run.inputPayload, run.inputPayloadIv, run.keyVersion),
    outputPayload: run.outputPayload
      ? decryptConfig(run.outputPayload, run.outputPayloadIv, run.keyVersion)
      : null,
    inputTokens: run.inputTokens ?? null,
    outputTokens: run.outputTokens ?? null,
    errorCode: run.errorCode ?? null,
    errorMessage: run.errorMessage ?? null,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
  });
});

export default app;
