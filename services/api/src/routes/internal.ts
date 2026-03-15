/**
 * Internal-only routes — not exposed through the public gateway.
 * Authenticated by a shared INTERNAL_SECRET header, not user JWTs.
 *
 * POST /internal/delegate — synchronous agent-to-agent delegation
 * POST /internal/run-event — realtime run status events from daemon
 */
import { agentSkills, agents, db } from "@maschina/db";
import { and, eq, isNull } from "@maschina/db";
import { resolveModel } from "@maschina/model";
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

export default app;
