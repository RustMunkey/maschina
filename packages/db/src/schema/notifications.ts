import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const notificationTypeEnum = pgEnum("notification_type", [
  "agent_run_completed",
  "agent_run_failed",
  "usage_quota_warning", // 80% of quota
  "usage_quota_exceeded",
  "billing_payment_failed",
  "billing_invoice_ready",
  "team_invite_received",
  "team_member_joined",
  "system_announcement",
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  metadata: jsonb("metadata"), // link, resourceId, etc.

  read: boolean("read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
