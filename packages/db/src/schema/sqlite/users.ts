import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(), // encrypted
  emailIndex: text("email_index").notNull().unique(), // HMAC for lookups
  name: text("name"), // encrypted
  avatarUrl: text("avatar_url"),
  role: text("role", { enum: ["owner", "admin", "member", "viewer"] })
    .notNull()
    .default("member"),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  licenseToken: text("license_token"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const userPasswords = sqliteTable("user_passwords", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
