import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { webhookDeliveryStatusEnum, webhookStatusEnum } from "./enums.js";
import { users } from "./users.js";

export const webhooks = pgTable("webhooks", {
  id:     uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId:  uuid("org_id"),

  url:          text("url").notNull(),
  secretHash:   text("secret_hash").notNull(), // HMAC signing secret — hashed at rest
  events:       jsonb("events").notNull(),      // string[] of event types
  status:       webhookStatusEnum("status").notNull().default("active"),
  failureCount: integer("failure_count").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx:  index("webhooks_user_id_idx").on(t.userId),
  statusIdx:  index("webhooks_status_idx").on(t.status),
}));

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id:         uuid("id").primaryKey().defaultRandom(),
  webhookId:  uuid("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),

  event:          text("event").notNull(),
  payload:        jsonb("payload").notNull(),
  status:         webhookDeliveryStatusEnum("status").notNull().default("pending"),
  responseStatus: integer("response_status"),
  responseBody:   text("response_body"),
  attempt:        integer("attempt").notNull().default(1),
  nextRetryAt:    timestamp("next_retry_at", { withTimezone: true }),

  createdAt:    timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
  deliveredAt:  timestamp("delivered_at", { withTimezone: true }),
}, (t) => ({
  webhookIdIdx:   index("webhook_deliveries_webhook_id_idx").on(t.webhookId),
  statusIdx:      index("webhook_deliveries_status_idx").on(t.status),
  nextRetryIdx:   index("webhook_deliveries_next_retry_idx").on(t.nextRetryAt),
}));

export type Webhook         = typeof webhooks.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
