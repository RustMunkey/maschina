import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const reputationScores = pgTable("reputation_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id"),

  // composite score 0–100
  score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),

  // components
  successRate: numeric("success_rate", { precision: 5, scale: 2 }),
  totalRuns: integer("total_runs").notNull().default(0),
  successfulRuns: integer("successful_runs").notNull().default(0),
  avgCompletionMs: integer("avg_completion_ms"),

  // on-chain staked amount (USDC)
  stakedUsdc: numeric("staked_usdc", { precision: 18, scale: 6 }).default("0"),
  onChainAddress: text("on_chain_address"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reputationEvents = pgTable("reputation_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id"),

  event: text("event").notNull(), // "run_success" | "run_failure" | "dispute_resolved"
  delta: numeric("delta", { precision: 5, scale: 2 }).notNull(),
  scoreBefore: numeric("score_before", { precision: 5, scale: 2 }).notNull(),
  scoreAfter: numeric("score_after", { precision: 5, scale: 2 }).notNull(),
  metadata: text("metadata"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReputationScore = typeof reputationScores.$inferSelect;
export type ReputationEvent = typeof reputationEvents.$inferSelect;
