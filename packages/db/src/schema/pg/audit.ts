import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// Append-only. Never update or delete. Immutable audit trail.
export const auditLogs = pgTable("audit_logs", {
  id:     uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  orgId:  uuid("org_id"),

  action:     text("action").notNull(),     // "user.login" | "agent.deployed" | "key.revoked"
  resource:   text("resource").notNull(),   // "user" | "agent" | "api_key" | "subscription"
  resourceId: text("resource_id"),

  // Encrypted PII — IP/UA are personal data under GDPR
  ipAddress:  text("ip_address"), // encrypted
  userAgent:  text("user_agent"),
  ipIv:       text("ip_iv"),      // IV for IP encryption

  // Before/after state — S3 key for large diffs
  metadata:         jsonb("metadata"),
  diffStorageKey:   text("diff_storage_key"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx:    index("audit_user_id_idx").on(t.userId),
  orgIdIdx:     index("audit_org_id_idx").on(t.orgId),
  actionIdx:    index("audit_action_idx").on(t.action),
  resourceIdx:  index("audit_resource_idx").on(t.resource, t.resourceId),
  createdAtIdx: index("audit_created_at_idx").on(t.createdAt),
}));

export type AuditLog    = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
