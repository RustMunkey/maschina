import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const webhookStatusEnum = pgEnum("webhook_status", ["active", "disabled", "failing"]);
export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "success",
  "failed",
  "retrying",
]);

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: uuid("org_id"),

  url: text("url").notNull(),
  secretHash: text("secret_hash").notNull(),  // HMAC signing secret (hashed at rest)
  events: jsonb("events").notNull(),          // ["agent.run.completed", "usage.quota.exceeded"]
  status: webhookStatusEnum("status").notNull().default("active"),
  failureCount: integer("failure_count").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  webhookId: uuid("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),

  event: text("event").notNull(),
  payload: jsonb("payload").notNull(),
  status: webhookDeliveryStatusEnum("status").notNull().default("pending"),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  attempt: integer("attempt").notNull().default(1),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
