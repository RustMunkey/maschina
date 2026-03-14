import { db } from "@maschina/db";
import { agents, workflowRuns, workflows } from "@maschina/db";
import { and, desc, eq } from "@maschina/db";
import { Subjects } from "@maschina/events";
import { publishSafe } from "@maschina/nats";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const StepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["agent_run", "condition", "parallel_group"]),
  agentId: z.string().uuid().optional(),
  prompt: z.string().max(4000).optional(),
  // For conditional steps
  conditionField: z.string().optional(),
  dependsOn: z.string().optional(),
  onTrue: z.string().optional(),
  onFalse: z.string().optional(),
  // Sequential next step
  onSuccess: z.string().optional(),
  // Per-step model/skill overrides
  config: z.record(z.unknown()).optional(),
});

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  type: z.enum(["sequential", "parallel", "conditional"]).default("sequential"),
  steps: z.array(StepSchema).min(1).max(20),
});

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  steps: z.array(StepSchema).min(1).max(20).optional(),
});

const TriggerSchema = z.object({
  input: z.record(z.unknown()).default({}),
});

// ─── GET /workflows ───────────────────────────────────────────────────────────

app.get("/", requireAuth, async (c) => {
  const { id: userId } = c.get("user");

  const rows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.userId, userId))
    .orderBy(desc(workflows.createdAt));

  return c.json(rows);
});

// ─── POST /workflows ──────────────────────────────────────────────────────────

app.post("/", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = CreateWorkflowSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  // Validate all agent_run steps reference agents owned by this user
  const agentIds = parsed.data.steps
    .filter((s) => s.type === "agent_run" && s.agentId)
    .map((s) => s.agentId as string);

  if (agentIds.length > 0) {
    const owned = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.userId, userId)));

    const ownedSet = new Set(owned.map((a: { id: string }) => a.id));
    const invalid = agentIds.find((id) => !ownedSet.has(id));
    if (invalid) {
      throw new HTTPException(403, { message: `Agent ${invalid} not found or not owned by you` });
    }
  }

  const [workflow] = await db
    .insert(workflows)
    .values({
      userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      type: parsed.data.type,
      steps: parsed.data.steps,
    })
    .returning();

  return c.json(workflow, 201);
});

// ─── GET /workflows/:id ───────────────────────────────────────────────────────

app.get("/:id", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const workflowId = c.req.param("id");

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, userId)))
    .limit(1);

  if (!workflow) throw new HTTPException(404, { message: "Workflow not found" });

  const runs = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, workflowId))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(20);

  return c.json({ ...workflow, runs });
});

// ─── PATCH /workflows/:id ─────────────────────────────────────────────────────

app.patch("/:id", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const workflowId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateWorkflowSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const [existing] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, userId)))
    .limit(1);

  if (!existing) throw new HTTPException(404, { message: "Workflow not found" });

  const updates: Partial<typeof workflows.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.steps !== undefined) updates.steps = parsed.data.steps;

  const [updated] = await db
    .update(workflows)
    .set(updates)
    .where(eq(workflows.id, workflowId))
    .returning();

  return c.json(updated);
});

// ─── DELETE /workflows/:id ────────────────────────────────────────────────────

app.delete("/:id", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const workflowId = c.req.param("id");

  const [existing] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, userId)))
    .limit(1);

  if (!existing) throw new HTTPException(404, { message: "Workflow not found" });

  await db.delete(workflows).where(eq(workflows.id, workflowId));

  return c.json({ deleted: true });
});

// ─── POST /workflows/:id/runs — trigger ───────────────────────────────────────

app.post("/:id/runs", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const workflowId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = TriggerSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, userId)))
    .limit(1);

  if (!workflow) throw new HTTPException(404, { message: "Workflow not found" });

  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowId,
      userId,
      status: "pending",
      input: parsed.data.input,
    })
    .returning();

  // Publish to NATS — worker picks up and starts Temporal workflow
  publishSafe(Subjects.WorkflowRunQueued, {
    runId: run.id,
    workflowId,
    userId,
    workflowType: workflow.type,
    steps: Array.isArray(workflow.steps) ? (workflow.steps as Array<Record<string, unknown>>) : [],
    input: parsed.data.input,
  });

  return c.json(run, 202);
});

// ─── GET /workflows/:id/runs ──────────────────────────────────────────────────

app.get("/:id/runs", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const workflowId = c.req.param("id");

  const [workflow] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, userId)))
    .limit(1);

  if (!workflow) throw new HTTPException(404, { message: "Workflow not found" });

  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);

  const runs = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, workflowId))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json(runs);
});

// ─── GET /workflows/:id/runs/:runId ──────────────────────────────────────────

app.get("/:id/runs/:runId", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const workflowId = c.req.param("id");
  const runId = c.req.param("runId");

  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.workflowId, workflowId),
        eq(workflowRuns.userId, userId),
      ),
    )
    .limit(1);

  if (!run) throw new HTTPException(404, { message: "Run not found" });

  return c.json(run);
});

// ─── DELETE /workflows/:id/runs/:runId — cancel ───────────────────────────────

app.delete("/:id/runs/:runId", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const workflowId = c.req.param("id");
  const runId = c.req.param("runId");

  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, runId),
        eq(workflowRuns.workflowId, workflowId),
        eq(workflowRuns.userId, userId),
      ),
    )
    .limit(1);

  if (!run) throw new HTTPException(404, { message: "Run not found" });
  if (run.status === "completed" || run.status === "cancelled") {
    throw new HTTPException(400, { message: `Run is already ${run.status}` });
  }

  const [cancelled] = await db
    .update(workflowRuns)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(workflowRuns.id, runId))
    .returning();

  // Signal Temporal to cancel if it has a workflow ID
  if (run.temporalWorkflowId) {
    publishSafe(Subjects.WorkflowRunCancelled, {
      runId,
      temporalWorkflowId: run.temporalWorkflowId,
    });
  }

  return c.json(cancelled);
});

export default app;
