import { db, executionReceipts } from "@maschina/db";
import { and, desc, eq } from "@maschina/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

// ─── GET /receipts/:id ────────────────────────────────────────────────────────

const app = new Hono<{ Variables: Variables }>();

app.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const receiptId = c.req.param("id");

  const receipt = await db.query.executionReceipts.findFirst({
    where: and(eq(executionReceipts.id, receiptId), eq(executionReceipts.userId, userId)),
  });

  if (!receipt) {
    throw new HTTPException(404, { message: "Receipt not found" });
  }

  return c.json({ receipt });
});

export default app;

// ─── GET /agents/:agentId/receipts ───────────────────────────────────────────
// Mounted under /agents in app.ts

export const agentReceiptsApp = new Hono<{ Variables: Variables }>();

agentReceiptsApp.get("/:agentId/receipts", requireAuth, async (c) => {
  const userId = c.get("userId");
  const agentId = c.req.param("agentId");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);

  const rows = await db.query.executionReceipts.findMany({
    where: and(eq(executionReceipts.agentId, agentId), eq(executionReceipts.userId, userId)),
    orderBy: desc(executionReceipts.issuedAt),
    limit,
    offset,
  });

  return c.json({ receipts: rows, limit, offset });
});
