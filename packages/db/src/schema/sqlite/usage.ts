import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { apiKeys } from "./api_keys.js";
import { users } from "./users.js";

export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  type: text("type", {
    enum: ["api_call", "agent_execution", "model_inference", "storage_read", "storage_write"],
  }).notNull(),
  units: integer("units").notNull().default(1),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  model: text("model"),
  agentId: text("agent_id"),
  payloadStorageKey: text("payload_storage_key"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const usageRollups = sqliteTable("usage_rollups", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["api_call", "agent_execution", "model_inference", "storage_read", "storage_write"],
  }).notNull(),
  periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
  periodEnd: integer("period_end", { mode: "timestamp" }).notNull(),
  totalUnits: integer("total_units").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type UsageEvent = typeof usageEvents.$inferSelect;
export type UsageRollup = typeof usageRollups.$inferSelect;
