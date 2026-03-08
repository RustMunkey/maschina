import { db } from "@maschina/db";
import { agents } from "@maschina/db";
import { and, eq, isNull } from "@maschina/db";
import { Subjects } from "@maschina/events";
import { dispatchAgentRun } from "@maschina/jobs";
import { resolveModel, validateModelAccess } from "@maschina/model";
import { publishSafe } from "@maschina/nats";
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
import type { Variables } from "../context.js";
import { requireAuth, requireFeature } from "../middleware/auth.js";
import { requireQuota, trackApiCall } from "../middleware/quota.js";

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

  const [agent] = await db
    .insert(agents)
    .values({
      userId: user.id,
      name: sanitizeText(input.name),
      description: input.description ? sanitizeText(input.description) : null,
      type: input.type,
      status: "idle",
      config: input.config,
      version: 1,
    })
    .returning();

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
  if (input.config !== undefined) updates.config = input.config;

  const [updated] = await db
    .update(agents)
    .set(updates)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId), isNull(agents.deletedAt)))
    .returning();

  if (!updated) throw new HTTPException(404, { message: "Agent not found" });

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

  return c.json({ success: true });
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

    // Validate model access and resolve to the appropriate model for this tier
    if (input.model) {
      const access = validateModelAccess(user.tier, input.model);
      if (!access.allowed) {
        throw new HTTPException(403, {
          message: access.reason ?? "Model not available on your plan.",
        });
      }
    }
    const resolvedModel = resolveModel(user.tier, input.model);

    // Resolve system prompt from agent config, fall back to a sensible default
    const agentConfig = (agent.config ?? {}) as Record<string, unknown>;
    const systemPrompt =
      typeof agentConfig.systemPrompt === "string"
        ? agentConfig.systemPrompt
        : `You are a Maschina ${agent.type} agent named "${agent.name}". Complete the task provided.`;

    // Convert timeout from ms (API input) to seconds (runtime)
    const timeoutSecs = Math.floor((input.timeout ?? 300_000) / 1000);

    // Insert the agent_runs row
    const { agentRuns } = await import("@maschina/db");
    const [run] = await db
      .insert(agentRuns)
      .values({
        agentId,
        userId: user.id,
        status: "queued",
        inputPayload: input.input ?? {},
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

export default app;
