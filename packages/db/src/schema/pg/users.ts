import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userRoleEnum } from "./enums.js";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // ── Encrypted PII ─────────────────────────────────────────────────────────
    // email is encrypted at application layer (AES-256-GCM) before storage.
    // emailIndex stores a deterministic HMAC-SHA256 of the email for lookups.
    email: text("email").notNull().unique(), // encrypted
    emailIndex: text("email_index").notNull().unique(), // HMAC for lookups
    name: text("name"), // encrypted
    avatarUrl: text("avatar_url"),

    keyVersion: integer("key_version").notNull().default(1), // encryption key version for email/name

    role: userRoleEnum("role").notNull().default("member"),
    emailVerified: boolean("email_verified").notNull().default(false),

    // Offline license heartbeat
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    licenseToken: text("license_token"), // cached offline license

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    emailIndexIdx: uniqueIndex("users_email_index_idx").on(t.emailIndex),
    roleIdx: index("users_role_idx").on(t.role),
    createdAtIdx: index("users_created_at_idx").on(t.createdAt),
    deletedAtIdx: index("users_deleted_at_idx").on(t.deletedAt),
  }),
);

export const userPasswords = pgTable("user_passwords", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(), // argon2id
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
