import { agentPermissions, agents, db } from "@maschina/db";
import { and, eq } from "@maschina/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

const VALID_PERMISSIONS = [
  "internet_access",
  "code_execution",
  "external_api",
  "file_read",
  "file_write",
  "memory_read",
  "memory_write",
  "send_email",
  "send_webhook",
] as const;

type Permission = (typeof VALID_PERMISSIONS)[number];

const PermissionsSchema = z.object({
  permissions: z.array(z.enum(VALID_PERMISSIONS)),
});

// ─── GET /agents/:agentId/permissions ────────────────────────────────────────

app.get("/:agentId/permissions", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const agentId = c.req.param("agentId");

  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.userId, userId)),
  });
  if (!agent) throw new HTTPException(404, { message: "Agent not found" });

  const rows = await db.query.agentPermissions.findMany({
    where: eq(agentPermissions.agentId, agentId),
  });

  return c.json({ permissions: rows.map((r: { permission: Permission }) => r.permission) });
});

// ─── PUT /agents/:agentId/permissions ────────────────────────────────────────
// Replaces the full permission set atomically.

app.put("/:agentId/permissions", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const agentId = c.req.param("agentId");

  const body = await c.req.json();
  const parsed = PermissionsSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid permissions list" });
  }

  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.userId, userId)),
  });
  if (!agent) throw new HTTPException(404, { message: "Agent not found" });

  const unique = [...new Set(parsed.data.permissions)] as Permission[];

  await db.transaction(async (tx: typeof db) => {
    await tx.delete(agentPermissions).where(eq(agentPermissions.agentId, agentId));
    if (unique.length > 0) {
      await tx.insert(agentPermissions).values(
        unique.map((permission) => ({
          agentId,
          permission,
          grantedByUserId: userId,
        })),
      );
    }
  });

  return c.json({ permissions: unique });
});

// ─── DELETE /agents/:agentId/permissions/:permission ─────────────────────────

app.delete("/:agentId/permissions/:permission", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const agentId = c.req.param("agentId");
  const permission = c.req.param("permission") as Permission;

  if (!VALID_PERMISSIONS.includes(permission)) {
    throw new HTTPException(400, { message: `Unknown permission: ${permission}` });
  }

  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.id, agentId), eq(agents.userId, userId)),
  });
  if (!agent) throw new HTTPException(404, { message: "Agent not found" });

  await db
    .delete(agentPermissions)
    .where(and(eq(agentPermissions.agentId, agentId), eq(agentPermissions.permission, permission)));

  return c.json({ ok: true });
});

export default app;
