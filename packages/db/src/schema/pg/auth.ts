import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const sessions = pgTable("sessions", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash:    text("token_hash").notNull().unique(), // SHA-256 of refresh token
  userAgent:    text("user_agent"),
  ipAddress:    text("ip_address"),                   // encrypted
  expiresAt:    timestamp("expires_at",   { withTimezone: true }).notNull(),
  createdAt:    timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:   timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tokenHashIdx:   uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
  userIdIdx:      index("sessions_user_id_idx").on(t.userId),
  expiresAtIdx:   index("sessions_expires_at_idx").on(t.expiresAt),
}));

export const oauthAccounts = pgTable("oauth_accounts", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  userId:             uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider:           text("provider").notNull(),           // "google" | "github" | "discord"
  providerAccountId:  text("provider_account_id").notNull(),
  accessToken:        text("access_token"),                 // AES-256-GCM encrypted
  refreshToken:       text("refresh_token"),                // AES-256-GCM encrypted
  tokenIv:            text("token_iv"),                     // IV for token encryption
  expiresAt:          timestamp("expires_at", { withTimezone: true }),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  providerAccountIdx: uniqueIndex("oauth_provider_account_idx").on(t.provider, t.providerAccountId),
  userIdIdx:          index("oauth_user_id_idx").on(t.userId),
}));

export const verificationTokens = pgTable("verification_tokens", {
  id:         uuid("id").primaryKey().defaultRandom(),
  userId:     uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type:       text("type").notNull(), // "email_verification" | "password_reset"
  tokenHash:  text("token_hash").notNull().unique(),
  expiresAt:  timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt:     timestamp("used_at",    { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tokenHashIdx:   uniqueIndex("verification_token_hash_idx").on(t.tokenHash),
  userIdTypeIdx:  index("verification_user_type_idx").on(t.userId, t.type),
  expiresAtIdx:   index("verification_expires_at_idx").on(t.expiresAt),
}));

export type Session           = typeof sessions.$inferSelect;
export type OAuthAccount      = typeof oauthAccounts.$inferSelect;
export type VerificationToken = typeof verificationTokens.$inferSelect;
