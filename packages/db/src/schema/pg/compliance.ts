import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { consentTypeEnum, dataExportStatusEnum } from "./enums.js";
import { users } from "./users.js";

// ─── GDPR consent records ─────────────────────────────────────────────────────
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: consentTypeEnum("type").notNull(),
    version: text("version").notNull(), // "1.0", "2.1" — consent to specific version
    granted: boolean("granted").notNull(),
    ipAddress: text("ip_address"), // encrypted — proof of consent
    ipIv: text("ip_iv"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("consent_user_id_idx").on(t.userId),
    userTypeIdx: index("consent_user_type_idx").on(t.userId, t.type),
  }),
);

// ─── Model training consent ───────────────────────────────────────────────────
// Explicit opt-in for using interaction data to train Maschina's model
export const trainingConsent = pgTable(
  "training_consent",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    optedIn: boolean("opted_in").notNull().default(false),
    optedInAt: timestamp("opted_in_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    dataFromDate: timestamp("data_from_date", { withTimezone: true }), // only data after this date
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    optedInIdx: index("training_consent_opted_in_idx").on(t.optedIn),
  }),
);

// ─── Data retention policies ──────────────────────────────────────────────────
export const dataRetentionPolicies = pgTable("data_retention_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  resource: text("resource").notNull().unique(), // "usage_events" | "audit_logs" | "agent_runs"
  retainDays: integer("retain_days").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── GDPR data export requests (Article 15 — right of access) ─────────────────
export const dataExportRequests = pgTable(
  "data_export_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: dataExportStatusEnum("status").notNull().default("pending"),
    storageKey: text("storage_key"), // S3 key when ready
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    userIdIdx: index("data_export_user_id_idx").on(t.userId),
    statusIdx: index("data_export_status_idx").on(t.status),
  }),
);

// ─── Encryption key version tracking ─────────────────────────────────────────
// Track which key version encrypted which records (for rotation)
export const encryptionKeyVersions = pgTable(
  "encryption_key_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: integer("version").notNull().unique(),
    algorithm: text("algorithm").notNull().default("AES-256-GCM"),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(false),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index("enc_key_active_idx").on(t.isActive),
  }),
);

export type ConsentRecord = typeof consentRecords.$inferSelect;
export type TrainingConsent = typeof trainingConsent.$inferSelect;
export type DataExportRequest = typeof dataExportRequests.$inferSelect;
export type EncryptionKeyVersion = typeof encryptionKeyVersions.$inferSelect;
