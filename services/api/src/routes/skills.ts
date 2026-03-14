import { canUseSkill, listSkills } from "@maschina/connectors";
import { db } from "@maschina/db";
import { agentSkills, agents } from "@maschina/db";
import { and, eq } from "@maschina/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

// Mounted at /skills — catalog endpoint
export const catalogApp = new Hono<{ Variables: Variables }>();

catalogApp.get("/", requireAuth, (c) => {
  const user = c.get("user");
  const catalog = listSkills().map((s) => ({
    ...s,
    available: canUseSkill(user.tier, s.slug),
  }));
  return c.json(catalog);
});

// Mounted at /agents — per-agent skill management
const app = new Hono<{ Variables: Variables }>();

// ─── Ownership guard ──────────────────────────────────────────────────────────

async function resolveAgent(agentId: string, userId: string, role: string) {
  const [agent] = await db
    .select({ id: agents.id, userId: agents.userId })
    .from(agents)
    .where(
      role === "admin"
        ? eq(agents.id, agentId)
        : and(eq(agents.id, agentId), eq(agents.userId, userId)),
    )
    .limit(1);
  return agent ?? null;
}

// ─── GET /agents/:agentId/skills ──────────────────────────────────────────────

app.get("/:agentId/skills", requireAuth, async (c) => {
  const { id: userId, role } = c.get("user");
  const agentId = c.req.param("agentId");

  const agent = await resolveAgent(agentId, userId, role);
  if (!agent) throw new HTTPException(404, { message: "Agent not found" });

  const rows = await db.select().from(agentSkills).where(eq(agentSkills.agentId, agentId));

  return c.json(rows);
});

// ─── PUT /agents/:agentId/skills/:slug ────────────────────────────────────────
// Enable or update a skill for an agent.

const UpsertSkillSchema = z.object({
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
});

app.put("/:agentId/skills/:slug", requireAuth, async (c) => {
  const { id: userId, role } = c.get("user");
  const agentId = c.req.param("agentId");
  const slug = c.req.param("slug");

  const agent = await resolveAgent(agentId, userId, role);
  if (!agent) throw new HTTPException(404, { message: "Agent not found" });

  // Validate skill exists in catalog
  const catalog = listSkills();
  const skillDef = catalog.find((s) => s.slug === slug);
  if (!skillDef) throw new HTTPException(400, { message: `Unknown skill: ${slug}` });

  // Enforce tier gate
  if (!canUseSkill(c.get("user").tier, slug)) {
    throw new HTTPException(403, {
      message: `Skill '${skillDef.name}' requires the ${skillDef.minTier} plan or higher.`,
    });
  }

  const body = await c.req.json().catch(() => null);
  const parsed = UpsertSkillSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const [row] = await db
    .insert(agentSkills)
    .values({
      agentId,
      skillName: slug,
      config: parsed.data.config,
      enabled: parsed.data.enabled,
    })
    .onConflictDoUpdate({
      target: [agentSkills.agentId, agentSkills.skillName],
      set: {
        enabled: parsed.data.enabled,
        config: parsed.data.config,
        updatedAt: new Date(),
      },
    })
    .returning();

  return c.json(row);
});

// ─── DELETE /agents/:agentId/skills/:slug ────────────────────────────────────

app.delete("/:agentId/skills/:slug", requireAuth, async (c) => {
  const { id: userId, role } = c.get("user");
  const agentId = c.req.param("agentId");
  const slug = c.req.param("slug");

  const agent = await resolveAgent(agentId, userId, role);
  if (!agent) throw new HTTPException(404, { message: "Agent not found" });

  await db
    .delete(agentSkills)
    .where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillName, slug)));

  return c.json({ success: true });
});

export default app;
