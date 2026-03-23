import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(), // SHA-256 of refresh token
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"), // encrypted
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    userIdIdx: index("sessions_user_id_idx").on(t.userId),
    expiresAtIdx: index("sessions_expires_at_idx").on(t.expiresAt),
  }),
);

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "google" | "github" | "discord"
    providerAccountId: text("provider_account_id").notNull(),
    accessToken: text("access_token"), // AES-256-GCM encrypted
    refreshToken: text("refresh_token"), // AES-256-GCM encrypted
    tokenIv: text("token_iv"), // IV for token encryption
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerAccountIdx: uniqueIndex("oauth_provider_account_idx").on(
      t.provider,
      t.providerAccountId,
    ),
    userIdIdx: index("oauth_user_id_idx").on(t.userId),
  }),
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "email_verification" | "password_reset"
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("verification_token_hash_idx").on(t.tokenHash),
    userIdTypeIdx: index("verification_user_type_idx").on(t.userId, t.type),
    expiresAtIdx: index("verification_expires_at_idx").on(t.expiresAt),
  }),
);

// Keyed on emailIndex (HMAC of email) so it works pre-signup when userId doesn't exist yet.
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailIndex: text("email_index").notNull(), // HMAC-SHA256(email.toLowerCase(), JWT_SECRET)
    codeHash: text("code_hash").notNull(), // SHA-256 of 6-digit code
    attempts: integer("attempts").notNull().default(0), // max 5
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIndexIdx: index("otp_email_index_idx").on(t.emailIndex),
    expiresAtIdx: index("otp_expires_at_idx").on(t.expiresAt),
  }),
);

// OAuth Device Flow — CLI polls with deviceCodeHash, user confirms with userCode at /device.
export const deviceCodes = pgTable(
  "device_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceCodeHash: text("device_code_hash").notNull().unique(), // SHA-256 of opaque code sent to CLI
    userCode: text("user_code").notNull().unique(), // short code user types at /device (e.g. "WXYZ-1234")
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // set on confirm
    scopes: text("scopes").notNull().default("cli"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    deviceCodeHashIdx: uniqueIndex("device_code_hash_idx").on(t.deviceCodeHash),
    userCodeIdx: uniqueIndex("device_user_code_idx").on(t.userCode),
    expiresAtIdx: index("device_expires_at_idx").on(t.expiresAt),
  }),
);

export type Session = typeof sessions.$inferSelect;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type VerificationToken = typeof verificationTokens.$inferSelect;
export type OtpCode = typeof otpCodes.$inferSelect;
export type DeviceCode = typeof deviceCodes.$inferSelect;
