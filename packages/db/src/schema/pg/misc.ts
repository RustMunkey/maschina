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
import { fileVisibilityEnum, walletNetworkEnum } from "./enums.js";
import { users } from "./users.js";

// ─── Wallets ──────────────────────────────────────────────────────────────────
export const walletAddresses = pgTable(
  "wallet_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id"),
    network: walletNetworkEnum("network").notNull(),
    address: text("address").notNull(),
    label: text("label"),
    isPrimary: boolean("is_primary").notNull().default(false),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userNetworkIdx: index("wallets_user_network_idx").on(t.userId, t.network),
    addressIdx: index("wallets_address_idx").on(t.address),
  }),
);

// ─── Files / Object storage ───────────────────────────────────────────────────
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    bucket: text("bucket").notNull(),
    key: text("key").notNull().unique(), // S3 object key
    visibility: fileVisibilityEnum("visibility").notNull().default("private"),
    purpose: text("purpose"), // "agent_artifact" | "model_checkpoint" | "report" | "avatar"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    userIdIdx: index("files_user_id_idx").on(t.userId),
    keyIdx: uniqueIndex("files_key_idx").on(t.key),
    purposeIdx: index("files_purpose_idx").on(t.purpose),
    deletedAtIdx: index("files_deleted_at_idx").on(t.deletedAt),
  }),
);

// ─── Feature flags ────────────────────────────────────────────────────────────
export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    description: text("description"),
    defaultValue: boolean("default_value").notNull().default(false),
    rolloutPercent: integer("rollout_percent").notNull().default(0), // 0–100
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyIdx: uniqueIndex("feature_flags_key_idx").on(t.key),
  }),
);

export const featureFlagOverrides = pgTable(
  "feature_flag_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => featureFlags.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    orgId: uuid("org_id"),
    value: boolean("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    flagUserIdx: index("flag_overrides_flag_user_idx").on(t.flagId, t.userId),
    flagOrgIdx: index("flag_overrides_flag_org_idx").on(t.flagId, t.orgId),
  }),
);

// ─── Reputation ───────────────────────────────────────────────────────────────
export const reputationScores = pgTable(
  "reputation_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id"),
    score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),
    successRate: numeric("success_rate", { precision: 5, scale: 2 }),
    totalRuns: integer("total_runs").notNull().default(0),
    successfulRuns: integer("successful_runs").notNull().default(0),
    avgCompletionMs: integer("avg_completion_ms"),
    stakedUsdc: numeric("staked_usdc", { precision: 18, scale: 6 }).default("0"),
    onChainAddress: text("on_chain_address"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("reputation_user_id_idx").on(t.userId),
    scoreIdx: index("reputation_score_idx").on(t.score),
  }),
);

export type WalletAddress = typeof walletAddresses.$inferSelect;
export type File = typeof files.$inferSelect;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type ReputationScore = typeof reputationScores.$inferSelect;
