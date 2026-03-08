import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users.js";

export const consentRecords = sqliteTable("consent_records", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["terms_of_service", "privacy_policy", "marketing", "data_processing"],
  }).notNull(),
  version: text("version").notNull(),
  granted: integer("granted", { mode: "boolean" }).notNull(),
  ipAddress: text("ip_address"), // encrypted
  ipIv: text("ip_iv"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const trainingConsent = sqliteTable("training_consent", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  optedIn: integer("opted_in", { mode: "boolean" }).notNull().default(false),
  optedInAt: integer("opted_in_at", { mode: "timestamp" }),
  optedOutAt: integer("opted_out_at", { mode: "timestamp" }),
  dataFromDate: integer("data_from_date", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const dataRetentionPolicies = sqliteTable("data_retention_policies", {
  id: text("id").primaryKey(),
  resource: text("resource").notNull().unique(),
  retainDays: integer("retain_days").notNull(),
  description: text("description"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const dataExportRequests = sqliteTable("data_export_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "processing", "ready", "expired"] })
    .notNull()
    .default("pending"),
  storageKey: text("storage_key"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  requestedAt: integer("requested_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export const encryptionKeyVersions = sqliteTable("encryption_key_versions", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().unique(),
  algorithm: text("algorithm").notNull().default("AES-256-GCM"),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  activatedAt: integer("activated_at", { mode: "timestamp" }),
  retiredAt: integer("retired_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type ConsentRecord = typeof consentRecords.$inferSelect;
export type TrainingConsent = typeof trainingConsent.$inferSelect;
export type DataExportRequest = typeof dataExportRequests.$inferSelect;
export type EncryptionKeyVersion = typeof encryptionKeyVersions.$inferSelect;
