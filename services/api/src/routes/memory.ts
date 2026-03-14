import { db } from "@maschina/db";
import { agents } from "@maschina/db";
import { and, eq } from "@maschina/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getQdrant() {
  const url = process.env.QDRANT_URL ?? "http://localhost:6333";
  const apiKey = process.env.QDRANT_API_KEY ?? "";
  return { url, apiKey };
}

async function qdrantScroll(
  agentId: string,
  limit: number,
  offset: string | null,
): Promise<{ points: unknown[]; nextOffset: string | null }> {
  const { url, apiKey } = getQdrant();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["api-key"] = apiKey;

  const body: Record<string, unknown> = {
    filter: { must: [{ key: "agent_id", match: { value: agentId } }] },
    limit,
    with_payload: true,
    with_vector: false,
  };
  if (offset) body.offset = offset;

  const res = await fetch(`${url}/collections/agent_memory/points/scroll`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Qdrant scroll failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    result: { points: unknown[]; next_page_offset: string | null };
  };
  return {
    points: data.result.points,
    nextOffset: data.result.next_page_offset ?? null,
  };
}

async function qdrantDelete(agentId: string): Promise<void> {
  const { url, apiKey } = getQdrant();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["api-key"] = apiKey;

  const res = await fetch(`${url}/collections/agent_memory/points/delete`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      filter: { must: [{ key: "agent_id", match: { value: agentId } }] },
    }),
  });

  if (!res.ok) {
    throw new Error(`Qdrant delete failed: ${res.status}`);
  }
}

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

// ─── GET /agents/:agentId/memory ──────────────────────────────────────────────

app.get("/:agentId/memory", requireAuth, async (c) => {
  const { id: userId, role } = c.get("user");
  const agentId = c.req.param("agentId");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = c.req.query("offset") ?? null;

  const agent = await resolveAgent(agentId, userId, role);
  if (!agent) throw new HTTPException(404, { message: "Agent not found" });

  try {
    const { points, nextOffset } = await qdrantScroll(agentId, limit, offset);
    return c.json({ points, nextOffset });
  } catch {
    return c.json({ points: [], nextOffset: null });
  }
});

// ─── DELETE /agents/:agentId/memory ──────────────────────────────────────────

app.delete("/:agentId/memory", requireAuth, async (c) => {
  const { id: userId, role } = c.get("user");
  const agentId = c.req.param("agentId");

  const agent = await resolveAgent(agentId, userId, role);
  if (!agent) throw new HTTPException(404, { message: "Agent not found" });

  try {
    await qdrantDelete(agentId);
  } catch (err) {
    throw new HTTPException(502, { message: "Memory store unavailable" });
  }

  return c.json({ success: true });
});

export default app;
