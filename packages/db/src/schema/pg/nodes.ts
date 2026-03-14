import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { nodeStatusEnum, nodeTierEnum } from "./enums.js";
import { users } from "./users.js";

// ─── Nodes ────────────────────────────────────────────────────────────────────
// Registered compute nodes in the Maschina network. Every node runs the
// services/runtime software and receives work from the daemon's EXECUTE phase.
// The daemon currently routes to one internal runtime — this table is the
// foundation for routing to any registered node.

export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Owner — the user or org that registered and operates this node
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id"),

    name: text("name").notNull(),
    description: text("description"),

    status: nodeStatusEnum("status").notNull().default("pending"),
    tier: nodeTierEnum("tier").notNull().default("standard"),

    // Software version running on this node (semver)
    version: text("version"),

    // Geographic region for latency-aware routing
    // e.g. "us-east", "eu-west", "ap-southeast"
    region: text("region"),

    // Internal URL the daemon routes to for this node (e.g. http://1.2.3.4:8001)
    // Null for Maschina-operated nodes (resolved via internal DNS)
    internalUrl: text("internal_url"),

    // Economic security — staked USDC as collateral against misbehaviour
    // Slashing reduces this. Zero stake = micro/edge tier only.
    stakedUsdc: numeric("staked_usdc", { precision: 18, scale: 6 }).notNull().default("0"),

    // Rolling reputation score (0–100). Updated by daemon ANALYZE phase.
    reputationScore: numeric("reputation_score", { precision: 5, scale: 2 })
      .notNull()
      .default("50"),

    // Lifetime counters — used for reputation calculation
    totalTasksCompleted: integer("total_tasks_completed").notNull().default(0),
    totalTasksFailed: integer("total_tasks_failed").notNull().default(0),
    totalTasksTimedOut: integer("total_tasks_timed_out").notNull().default(0),

    // Last time this node sent a heartbeat
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),

    // TEE attestation — set when a verified-tier node submits attestation proof
    teeAttested: boolean("tee_attested").notNull().default(false),
    teeAttestedAt: timestamp("tee_attested_at", { withTimezone: true }),
    teeProvider: text("tee_provider"), // "amd_sev" | "intel_sgx"

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
  },
  (t) => ({
    userIdIdx: index("nodes_user_id_idx").on(t.userId),
    statusIdx: index("nodes_status_idx").on(t.status),
    tierIdx: index("nodes_tier_idx").on(t.tier),
    regionIdx: index("nodes_region_idx").on(t.region),
    // Daemon queries active nodes by tier + region for routing decisions
    routingIdx: index("nodes_routing_idx").on(t.status, t.tier, t.region),
  }),
);

// ─── Node Capabilities ────────────────────────────────────────────────────────
// Hardware and software capabilities advertised by each node.
// Updated on node registration and whenever the node reports a change.
// The daemon uses this to match tasks with capable nodes.

export const nodeCapabilities = pgTable(
  "node_capabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nodeId: uuid("node_id")
      .notNull()
      .unique()
      .references(() => nodes.id, { onDelete: "cascade" }),

    // CPU
    cpuCores: integer("cpu_cores"),
    cpuModel: text("cpu_model"), // e.g. "Apple M4 Pro", "AMD EPYC 9654"
    architecture: text("architecture"), // "amd64" | "arm64"

    // Memory + Storage
    ramGb: numeric("ram_gb", { precision: 8, scale: 2 }),
    storageGb: numeric("storage_gb", { precision: 10, scale: 2 }),

    // GPU — null if no GPU present
    hasGpu: boolean("has_gpu").notNull().default(false),
    gpuModel: text("gpu_model"), // e.g. "NVIDIA H100", "Apple M4 Pro GPU"
    gpuVramGb: numeric("gpu_vram_gb", { precision: 8, scale: 2 }),
    gpuCount: integer("gpu_count"),

    // OS
    osType: text("os_type"), // "linux" | "macos" | "windows"
    osVersion: text("os_version"),

    // Concurrency — how many tasks this node can run simultaneously
    maxConcurrentTasks: integer("max_concurrent_tasks").notNull().default(1),

    // Network
    networkBandwidthMbps: integer("network_bandwidth_mbps"),

    // Model support — array of model IDs this node can serve
    // e.g. ["ollama/llama3.2", "claude-haiku-4-5"]
    // Anthropic/OpenAI models are available to all nodes with valid API keys.
    // Ollama models depend on what's pulled locally.
    supportedModels: jsonb("supported_models").notNull().default([]),

    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nodeIdIdx: uniqueIndex("node_capabilities_node_id_idx").on(t.nodeId),
    hasGpuIdx: index("node_capabilities_has_gpu_idx").on(t.hasGpu),
  }),
);

// ─── Node Heartbeats ─────────────────────────────────────────────────────────
// Rolling health log. Nodes ping every N seconds. The daemon marks a node
// offline if no heartbeat is received within the timeout window.
// Kept for short-term trend analysis — old rows are pruned by retention policy.

export const nodeHeartbeats = pgTable(
  "node_heartbeats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),

    // Snapshot of resource utilisation at heartbeat time
    cpuUsagePct: numeric("cpu_usage_pct", { precision: 5, scale: 2 }),
    ramUsagePct: numeric("ram_usage_pct", { precision: 5, scale: 2 }),
    activeTaskCount: integer("active_task_count").notNull().default(0),

    // Derived health signal — set by the heartbeat handler
    // "online" = healthy, "degraded" = high load or partial failure, "offline" = unreachable
    healthStatus: text("health_status").notNull().default("online"),

    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nodeIdIdx: index("node_heartbeats_node_id_idx").on(t.nodeId),
    // Most recent heartbeat per node is the common query
    nodeRecordedIdx: index("node_heartbeats_node_recorded_idx").on(t.nodeId, t.recordedAt),
  }),
);

export type Node = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
export type NodeCapabilities = typeof nodeCapabilities.$inferSelect;
export type NewNodeCapabilities = typeof nodeCapabilities.$inferInsert;
export type NodeHeartbeat = typeof nodeHeartbeats.$inferSelect;
export type NewNodeHeartbeat = typeof nodeHeartbeats.$inferInsert;
