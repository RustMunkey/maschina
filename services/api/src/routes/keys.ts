import { generateApiKey, hashApiKey } from "@maschina/auth";
import { db } from "@maschina/db";
import { apiKeys } from "@maschina/db";
import { and, eq, isNull } from "@maschina/db";
import { getPlan } from "@maschina/plans";
import { CreateApiKeySchema, assertValid, projectApiKey } from "@maschina/validation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth, requireFeature } from "../middleware/auth.js";
import { trackApiCall } from "../middleware/quota.js";

const app = new Hono<{ Variables: Variables }>();

app.use("*", requireAuth, requireFeature("useApiKeys"), trackApiCall);

// GET /keys
app.get("/", async (c) => {
  const { id } = c.get("user");

  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, id), eq(apiKeys.isActive, true)));

  return c.json(rows.map(projectApiKey));
});

// POST /keys
app.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const input = assertValid(CreateApiKeySchema, body);

  // Enforce key count limit
  const plan = getPlan(user.tier);
  if (plan.maxApiKeys !== -1) {
    const [{ count }] = await db
      .select({
        count: db.$count(apiKeys, and(eq(apiKeys.userId, user.id), eq(apiKeys.isActive, true))),
      })
      .from(apiKeys);
    if (Number(count) >= plan.maxApiKeys) {
      throw new HTTPException(403, {
        message: `Your plan allows a maximum of ${plan.maxApiKeys} API keys.`,
      });
    }
  }

  const { key, prefix } = generateApiKey(input.environment);
  const keyHash = hashApiKey(key);

  const [created] = await db
    .insert(apiKeys)
    .values({
      userId: user.id,
      name: input.name,
      keyHash,
      keyPrefix: prefix,
      monthlyLimit: input.monthlyLimit ?? null,
      expiresAt: input.expiresAt ?? null,
      isActive: true,
    })
    .returning();

  // Return the full key ONCE — never shown again after this response
  return c.json(
    {
      ...projectApiKey(created),
      key, // shown only on creation
      warning: "Save this key — it will not be shown again.",
    },
    201,
  );
});

// POST /keys/:id/rotate — deactivate old key, issue new key with same metadata
app.post("/:id/rotate", async (c) => {
  const { id: userId } = c.get("user");
  const keyId = c.req.param("id");

  const [existing] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)));

  if (!existing) throw new HTTPException(404, { message: "API key not found" });

  const { key, prefix } = generateApiKey(
    existing.keyPrefix?.startsWith("msk_test_") ? "test" : "live",
  );
  const keyHash = hashApiKey(key);

  const [created] = await db.transaction(async (tx: typeof db) => {
    await tx
      .update(apiKeys)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.isActive, true)));

    return tx
      .insert(apiKeys)
      .values({
        userId,
        name: existing.name,
        keyHash,
        keyPrefix: prefix,
        monthlyLimit: existing.monthlyLimit,
        expiresAt: existing.expiresAt,
        isActive: true,
      })
      .returning();
  });

  return c.json({
    ...projectApiKey(created),
    key,
    warning: "Save this key — it will not be shown again.",
    rotated: { previousId: keyId },
  });
});

// DELETE /keys/:id
app.delete("/:id", async (c) => {
  const { id: userId } = c.get("user");
  const keyId = c.req.param("id");

  const [deleted] = await db
    .update(apiKeys)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });

  if (!deleted) throw new HTTPException(404, { message: "API key not found" });

  return c.json({ success: true });
});

export default app;
