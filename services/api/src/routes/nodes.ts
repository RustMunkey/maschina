import {
  db,
  nodeCapabilities,
  nodeEarnings,
  nodeHeartbeats,
  nodeStakeEvents,
  nodes,
} from "@maschina/db";
import { and, desc, eq, sum } from "@maschina/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Variables } from "../context.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CapabilitiesSchema = z.object({
  cpuCores: z.number().int().positive().optional(),
  cpuModel: z.string().optional(),
  architecture: z.enum(["amd64", "arm64"]).optional(),
  ramGb: z.number().positive().optional(),
  storageGb: z.number().positive().optional(),
  hasGpu: z.boolean().optional(),
  gpuModel: z.string().optional(),
  gpuVramGb: z.number().positive().optional(),
  gpuCount: z.number().int().positive().optional(),
  osType: z.enum(["linux", "macos", "windows"]).optional(),
  osVersion: z.string().optional(),
  maxConcurrentTasks: z.number().int().min(1).default(1),
  networkBandwidthMbps: z.number().int().positive().optional(),
  supportedModels: z.array(z.string()).default([]),
});

const RegisterNodeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  region: z.string().optional(),
  // null = NATS-only node (no public endpoint required — home users behind NAT)
  internalUrl: z.string().url().optional(),
  version: z.string().optional(),
  capabilities: CapabilitiesSchema.optional(),
});

const HeartbeatSchema = z.object({
  cpuUsagePct: z.number().min(0).max(100).optional(),
  ramUsagePct: z.number().min(0).max(100).optional(),
  activeTaskCount: z.number().int().min(0).default(0),
  healthStatus: z.enum(["online", "degraded", "offline"]).default("online"),
});

// ─── POST /nodes/register ─────────────────────────────────────────────────────

app.post("/register", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = RegisterNodeSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const { capabilities, ...nodeData } = parsed.data;

  const [node] = await db
    .insert(nodes)
    .values({
      userId: user.id,
      name: nodeData.name,
      description: nodeData.description ?? null,
      region: nodeData.region ?? null,
      internalUrl: nodeData.internalUrl,
      version: nodeData.version ?? null,
      status: "pending",
    })
    .returning();

  if (capabilities) {
    await db.insert(nodeCapabilities).values({
      nodeId: node.id,
      cpuCores: capabilities.cpuCores ?? null,
      cpuModel: capabilities.cpuModel ?? null,
      architecture: capabilities.architecture ?? null,
      ramGb: capabilities.ramGb?.toString() ?? null,
      storageGb: capabilities.storageGb?.toString() ?? null,
      hasGpu: capabilities.hasGpu ?? false,
      gpuModel: capabilities.gpuModel ?? null,
      gpuVramGb: capabilities.gpuVramGb?.toString() ?? null,
      gpuCount: capabilities.gpuCount ?? null,
      osType: capabilities.osType ?? null,
      osVersion: capabilities.osVersion ?? null,
      maxConcurrentTasks: capabilities.maxConcurrentTasks,
      networkBandwidthMbps: capabilities.networkBandwidthMbps ?? null,
      supportedModels: capabilities.supportedModels,
    });
  }

  return c.json(node, 201);
});

// ─── POST /nodes/:id/heartbeat ───────────────────────────────────────────────

app.post("/:id/heartbeat", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const nodeId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = HeartbeatSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const [node] = await db
    .select({ id: nodes.id, status: nodes.status })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  if (!node) throw new HTTPException(404, { message: "Node not found" });
  if (node.status === "banned") throw new HTTPException(403, { message: "Node is banned" });

  // Record heartbeat
  await db.insert(nodeHeartbeats).values({
    nodeId,
    cpuUsagePct: parsed.data.cpuUsagePct?.toString() ?? null,
    ramUsagePct: parsed.data.ramUsagePct?.toString() ?? null,
    activeTaskCount: parsed.data.activeTaskCount,
    healthStatus: parsed.data.healthStatus,
  });

  // Activate node on first heartbeat
  await db
    .update(nodes)
    .set({
      lastHeartbeatAt: new Date(),
      status: node.status === "pending" ? "active" : node.status,
      updatedAt: new Date(),
    })
    .where(eq(nodes.id, nodeId));

  return c.json({ ok: true });
});

// ─── GET /nodes ───────────────────────────────────────────────────────────────

app.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const isAdmin = user.role === "admin";

  const rows = await db
    .select()
    .from(nodes)
    .where(isAdmin ? undefined : eq(nodes.userId, user.id))
    .orderBy(desc(nodes.createdAt));

  return c.json(rows);
});

// ─── GET /nodes/:id ───────────────────────────────────────────────────────────

app.get("/:id", requireAuth, async (c) => {
  const { id: userId, role } = c.get("user");
  const nodeId = c.req.param("id");

  const [node] = await db
    .select()
    .from(nodes)
    .where(
      role === "admin" ? eq(nodes.id, nodeId) : and(eq(nodes.id, nodeId), eq(nodes.userId, userId)),
    )
    .limit(1);

  if (!node) throw new HTTPException(404, { message: "Node not found" });

  const [caps] = await db
    .select()
    .from(nodeCapabilities)
    .where(eq(nodeCapabilities.nodeId, nodeId))
    .limit(1);

  const recent = await db
    .select()
    .from(nodeHeartbeats)
    .where(eq(nodeHeartbeats.nodeId, nodeId))
    .orderBy(desc(nodeHeartbeats.recordedAt))
    .limit(1);

  return c.json({ ...node, capabilities: caps ?? null, lastHeartbeat: recent[0] ?? null });
});

// ─── PATCH /nodes/:id ─────────────────────────────────────────────────────────

app.patch("/:id", requireAuth, async (c) => {
  const { id: userId, role } = c.get("user");
  const nodeId = c.req.param("id");
  const body = await c.req.json().catch(() => null);

  const UpdateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    region: z.string().optional(),
    internalUrl: z.string().url().optional(),
    status: z.enum(["active", "suspended", "offline"]).optional(),
  });

  // Only admins can change status
  if (body?.status && role !== "admin") {
    throw new HTTPException(403, { message: "Only admins can change node status" });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const [existing] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(
      role === "admin" ? eq(nodes.id, nodeId) : and(eq(nodes.id, nodeId), eq(nodes.userId, userId)),
    )
    .limit(1);

  if (!existing) throw new HTTPException(404, { message: "Node not found" });

  const updates: Partial<typeof nodes.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.region !== undefined) updates.region = parsed.data.region;
  if (parsed.data.internalUrl !== undefined) updates.internalUrl = parsed.data.internalUrl;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  const [updated] = await db.update(nodes).set(updates).where(eq(nodes.id, nodeId)).returning();

  return c.json(updated);
});

// ─── DELETE /nodes/:id ────────────────────────────────────────────────────────

app.delete("/:id", requireAuth, async (c) => {
  const { id: userId, role } = c.get("user");
  const nodeId = c.req.param("id");

  const [existing] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(
      role === "admin" ? eq(nodes.id, nodeId) : and(eq(nodes.id, nodeId), eq(nodes.userId, userId)),
    )
    .limit(1);

  if (!existing) throw new HTTPException(404, { message: "Node not found" });

  await db.delete(nodes).where(eq(nodes.id, nodeId));

  return c.json({ success: true });
});

// ─── GET /nodes/:id/earnings ──────────────────────────────────────────────────
// Returns per-run earnings ledger for a node. Node owner or admin only.

app.get("/:id/earnings", requireAuth, async (c) => {
  const { id: userId, role } = c.get("user");
  const nodeId = c.req.param("id");
  const status = c.req.query("status"); // optional filter: "pending" | "settled" | "slashed"
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);

  // Verify ownership (admin bypasses)
  if (role !== "admin") {
    const [node] = await db
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
      .limit(1);
    if (!node) throw new HTTPException(404, { message: "Node not found" });
  }

  const conditions = [eq(nodeEarnings.nodeId, nodeId)];
  if (status) conditions.push(eq(nodeEarnings.status, status));

  const rows = await db
    .select()
    .from(nodeEarnings)
    .where(and(...conditions))
    .orderBy(desc(nodeEarnings.createdAt))
    .limit(limit)
    .offset(offset);

  const [totals] = await db
    .select({
      totalPendingCents: sum(nodeEarnings.nodeCents),
    })
    .from(nodeEarnings)
    .where(and(eq(nodeEarnings.nodeId, nodeId), eq(nodeEarnings.status, "pending")));

  const [settled] = await db
    .select({
      totalSettledCents: sum(nodeEarnings.nodeCents),
    })
    .from(nodeEarnings)
    .where(and(eq(nodeEarnings.nodeId, nodeId), eq(nodeEarnings.status, "settled")));

  return c.json({
    nodeId,
    totalPendingCents: Number(totals?.totalPendingCents ?? 0),
    totalSettledCents: Number(settled?.totalSettledCents ?? 0),
    earnings: rows,
  });
});

// ─── POST /nodes/:id/public-key ───────────────────────────────────────────────
// Node binary submits its Ed25519 public key after generating a keypair locally.
// Idempotent — calling again updates the stored key (key rotation).

app.post("/:id/public-key", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const nodeId = c.req.param("id");
  const body = await c.req.json().catch(() => null);

  const Schema = z.object({
    publicKey: z.string().regex(/^[0-9a-f]{64}$/i, "publicKey must be 64-char hex (Ed25519)"),
  });
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const [node] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  if (!node) throw new HTTPException(404, { message: "Node not found" });

  const [updated] = await db
    .update(nodes)
    .set({ publicKey: parsed.data.publicKey, updatedAt: new Date() })
    .where(eq(nodes.id, nodeId))
    .returning({ id: nodes.id, publicKey: nodes.publicKey });

  return c.json(updated);
});

// ─── Staking helpers ──────────────────────────────────────────────────────────

// Minimum USDC stake required to remain in each tier.
// If a node's stake falls below the minimum (e.g. due to slashing),
// the daemon routing logic will downgrade the effective tier.
const STAKE_MINIMUMS: Record<string, number> = {
  micro: 0,
  edge: 100,
  standard: 500,
  verified: 5000,
  datacenter: 25000,
};

// ─── POST /nodes/:id/stake ────────────────────────────────────────────────────
// Record a USDC stake deposit. Off-chain for now; Phase 5 anchors on-chain.

app.post("/:id/stake", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const nodeId = c.req.param("id");
  const body = await c.req.json().catch(() => null);

  const Schema = z.object({
    amountUsdc: z.number().positive(),
    txSignature: z.string().optional(),
  });
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const [node] = await db
    .select({ id: nodes.id, tier: nodes.tier, stakedUsdc: nodes.stakedUsdc })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  if (!node) throw new HTTPException(404, { message: "Node not found" });

  const currentStake = Number(node.stakedUsdc ?? 0);
  const newBalance = currentStake + parsed.data.amountUsdc;

  const [event] = await db.transaction(async (tx: typeof db) => {
    await tx
      .update(nodes)
      .set({ stakedUsdc: newBalance.toFixed(6), updatedAt: new Date() })
      .where(eq(nodes.id, nodeId));

    return tx
      .insert(nodeStakeEvents)
      .values({
        nodeId,
        eventType: "deposit",
        amountUsdc: parsed.data.amountUsdc.toFixed(6),
        balanceAfterUsdc: newBalance.toFixed(6),
        txSignature: parsed.data.txSignature ?? null,
      })
      .returning();
  });

  return c.json({ nodeId, event }, 201);
});

// ─── POST /nodes/:id/unstake ──────────────────────────────────────────────────
// Request a stake withdrawal. Validates remaining balance >= tier minimum.

app.post("/:id/unstake", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const nodeId = c.req.param("id");
  const body = await c.req.json().catch(() => null);

  const Schema = z.object({
    amountUsdc: z.number().positive(),
    txSignature: z.string().optional(),
  });
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const [node] = await db
    .select({ id: nodes.id, tier: nodes.tier, stakedUsdc: nodes.stakedUsdc })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  if (!node) throw new HTTPException(404, { message: "Node not found" });

  const currentStake = Number(node.stakedUsdc ?? 0);
  const newBalance = currentStake - parsed.data.amountUsdc;

  if (newBalance < 0) {
    throw new HTTPException(400, { message: "Withdrawal exceeds staked balance" });
  }

  const tierMin = STAKE_MINIMUMS[node.tier] ?? 0;
  if (newBalance < tierMin) {
    throw new HTTPException(400, {
      message: `Balance after withdrawal (${newBalance} USDC) would fall below ${node.tier} tier minimum (${tierMin} USDC)`,
    });
  }

  const [event] = await db.transaction(async (tx: typeof db) => {
    await tx
      .update(nodes)
      .set({ stakedUsdc: newBalance.toFixed(6), updatedAt: new Date() })
      .where(eq(nodes.id, nodeId));

    return tx
      .insert(nodeStakeEvents)
      .values({
        nodeId,
        eventType: "withdraw",
        amountUsdc: (-parsed.data.amountUsdc).toFixed(6),
        balanceAfterUsdc: newBalance.toFixed(6),
        txSignature: parsed.data.txSignature ?? null,
      })
      .returning();
  });

  return c.json({ nodeId, event });
});

// ─── POST /nodes/:id/slash ────────────────────────────────────────────────────
// Admin-triggered slash. Burns slashPct% of current stake.

app.post("/:id/slash", requireAuth, requireRole("admin"), async (c) => {
  const { id: adminId } = c.get("user");
  const nodeId = c.req.param("id");
  const body = await c.req.json().catch(() => null);

  const Schema = z.object({
    slashPct: z.number().min(1).max(100),
    reason: z.string().min(1).max(500),
  });
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const [node] = await db
    .select({ id: nodes.id, stakedUsdc: nodes.stakedUsdc })
    .from(nodes)
    .where(eq(nodes.id, nodeId))
    .limit(1);

  if (!node) throw new HTTPException(404, { message: "Node not found" });

  const currentStake = Number(node.stakedUsdc ?? 0);
  const slashAmount = (currentStake * parsed.data.slashPct) / 100;
  const newBalance = currentStake - slashAmount;

  const tierMin = STAKE_MINIMUMS[node.tier] ?? 0;
  const belowMinimum = newBalance < tierMin;

  const [event] = await db.transaction(async (tx: typeof db) => {
    const nodeUpdate: Record<string, unknown> = {
      stakedUsdc: newBalance.toFixed(6),
      updatedAt: new Date(),
    };
    if (belowMinimum) {
      nodeUpdate.status = "suspended";
      nodeUpdate.suspendedAt = new Date();
    }

    await tx.update(nodes).set(nodeUpdate).where(eq(nodes.id, nodeId));

    return tx
      .insert(nodeStakeEvents)
      .values({
        nodeId,
        eventType: "slash",
        amountUsdc: (-slashAmount).toFixed(6),
        balanceAfterUsdc: newBalance.toFixed(6),
        reason: parsed.data.reason,
        triggeredBy: adminId,
        slashPct: parsed.data.slashPct.toFixed(2),
      })
      .returning();
  });

  return c.json({
    nodeId,
    slashAmount,
    newBalance,
    suspended: belowMinimum,
    event,
  });
});

// ─── GET /nodes/:id/stake ─────────────────────────────────────────────────────
// Returns current stake balance + event history. Node owner or admin only.

app.get("/:id/stake", requireAuth, async (c) => {
  const { id: userId, role } = c.get("user");
  const nodeId = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);

  const [node] = await db
    .select({ id: nodes.id, stakedUsdc: nodes.stakedUsdc, tier: nodes.tier })
    .from(nodes)
    .where(
      role === "admin" ? eq(nodes.id, nodeId) : and(eq(nodes.id, nodeId), eq(nodes.userId, userId)),
    )
    .limit(1);

  if (!node) throw new HTTPException(404, { message: "Node not found" });

  const events = await db
    .select()
    .from(nodeStakeEvents)
    .where(eq(nodeStakeEvents.nodeId, nodeId))
    .orderBy(desc(nodeStakeEvents.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    nodeId,
    stakedUsdc: Number(node.stakedUsdc ?? 0),
    tier: node.tier,
    tierMinimumUsdc: STAKE_MINIMUMS[node.tier] ?? 0,
    events,
  });
});

export default app;
