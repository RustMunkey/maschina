import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users.js";

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  monthlyLimit: integer("monthly_limit"),
  usageCount: integer("usage_count").notNull().default(0),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
