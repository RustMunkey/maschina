import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usageEventTypeEnum } from "./enums.js";
import { apiKeys } from "./api_keys.js";
import { users } from "./users.js";

// Append-only event log — never update or delete rows.
// Redis is the authoritative real-time counter; this is the durable audit log for billing/analytics.
export const usageEvents = pgTable("usage_events", {
  id:       uuid("id").primaryKey().defaultRandom(),
  userId:   uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),

  type:        usageEventTypeEnum("type").notNull(),
  units:       integer("units").notNull().default(1),  // combined total (e.g. input+output tokens)
  inputTokens: integer("input_tokens"),                // model inference only
  outputTokens: integer("output_tokens"),              // model inference only
  model:       text("model"),                          // model id, if applicable
  agentId:     text("agent_id"),                       // agent run id, if applicable

  // S3 key for large payloads — never store raw content here
  payloadStorageKey: text("payload_storage_key"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userCreatedAtIdx: index("usage_user_created_at_idx").on(t.userId, t.createdAt),
  userTypeIdx:      index("usage_user_type_idx").on(t.userId, t.type),
  apiKeyIdx:        index("usage_api_key_idx").on(t.apiKeyId),
  createdAtIdx:     index("usage_created_at_idx").on(t.createdAt),
}));

// Monthly checkpoint — synced nightly from Redis counters.
// Used for billing reconciliation, dashboards, and Redis cold-start hydration.
// Unique constraint on (userId, type, periodStart) enables atomic upserts.
export const usageRollups = pgTable("usage_rollups", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type:        usageEventTypeEnum("type").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd:   timestamp("period_end",   { withTimezone: true }).notNull(),
  totalUnits:  integer("total_units").notNull().default(0),
  updatedAt:   timestamp("updated_at",   { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Unique — required for ON CONFLICT DO UPDATE upserts during reconciliation
  userTypePeriodIdx: uniqueIndex("rollup_user_type_period_idx").on(t.userId, t.type, t.periodStart),
}));

export type UsageEvent  = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;
export type UsageRollup = typeof usageRollups.$inferSelect;
