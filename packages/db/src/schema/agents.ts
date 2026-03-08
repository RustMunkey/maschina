import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const agentTypeEnum = pgEnum("agent_type", [
  "signal",
  "analysis",
  "execution",
  "optimization",
  "reporting",
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "idle",
  "scanning",
  "evaluating",
  "executing",
  "analyzing",
  "scaling",
  "error",
  "stopped",
]);

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  type: agentTypeEnum("type").notNull(),
  status: agentStatusEnum("status").notNull().default("idle"),
  config: jsonb("config").notNull().default({}),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  phase: text("phase").notNull(), // SCAN | EVALUATE | EXECUTE | ANALYZE | SCALE
  status: text("status").notNull().default("running"),
  result: jsonb("result"),
  error: text("error"),

  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
