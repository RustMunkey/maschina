import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const apiKeys = pgTable("api_keys", {
  id:     uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  name:       text("name").notNull(),
  keyHash:    text("key_hash").notNull().unique(),  // SHA-256, timing-safe comparison
  keyPrefix:  text("key_prefix").notNull(),          // "msk_live_aBcDef..." display only

  // Quota — null inherits from plan
  monthlyLimit:   integer("monthly_limit"),
  usageCount:     integer("usage_count").notNull().default(0),
  lastUsedAt:     timestamp("last_used_at", { withTimezone: true }),

  isActive:   boolean("is_active").notNull().default(true),
  expiresAt:  timestamp("expires_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  keyHashIdx:   uniqueIndex("api_keys_hash_idx").on(t.keyHash),
  userIdIdx:    index("api_keys_user_id_idx").on(t.userId),
  activeIdx:    index("api_keys_active_idx").on(t.isActive),
  expiresAtIdx: index("api_keys_expires_at_idx").on(t.expiresAt),
}));

export type ApiKey    = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
