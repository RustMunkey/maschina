import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Feature flag definitions
export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),     // "enable_marketplace" | "new_agent_loop"
  description: text("description"),
  defaultValue: boolean("default_value").notNull().default(false),
  rolloutPercent: text("rollout_percent"),  // "0" - "100" for gradual rollout
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-user or per-org overrides
export const featureFlagOverrides = pgTable("feature_flag_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  flagId: uuid("flag_id").notNull().references(() => featureFlags.id, { onDelete: "cascade" }),
  userId: uuid("user_id"),
  orgId: uuid("org_id"),
  value: boolean("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type FeatureFlagOverride = typeof featureFlagOverrides.$inferSelect;
