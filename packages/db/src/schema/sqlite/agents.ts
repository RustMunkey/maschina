import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users.js";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  orgId: text("org_id"),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["signal", "analysis", "execution", "optimization", "reporting"],
  }).notNull(),
  status: text("status", {
    enum: [
      "idle",
      "scanning",
      "evaluating",
      "executing",
      "analyzing",
      "scaling",
      "error",
      "stopped",
    ],
  })
    .notNull()
    .default("idle"),
  config: text("config", { mode: "json" }).notNull().default("{}"), // encrypted
  configIv: text("config_iv"),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  status: text("status").notNull().default("running"),
  resultStorageKey: text("result_storage_key"),
  result: text("result", { mode: "json" }),
  error: text("error"),
  sandboxId: text("sandbox_id"),
  sandboxType: text("sandbox_type"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export type Agent = typeof agents.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
