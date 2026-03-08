import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { apiKeys } from "./api_keys.js";
import { users } from "./users.js";

export const usageEventTypeEnum = pgEnum("usage_event_type", [
  "api_call",
  "agent_execution",
  "model_inference",
  "storage_read",
  "storage_write",
]);

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),

  type: usageEventTypeEnum("type").notNull(),
  units: integer("units").notNull().default(1),
  model: text("model"),         // which model was used (if applicable)
  agentId: text("agent_id"),    // which agent (if applicable)
  metadata: text("metadata"),   // JSON string for extra context

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Monthly rollup for fast quota checks
export const usageRollups = pgTable("usage_rollups", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: usageEventTypeEnum("type").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  totalUnits: integer("total_units").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;
export type UsageRollup = typeof usageRollups.$inferSelect;
