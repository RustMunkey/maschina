import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { billingIntervalEnum, subscriptionStatusEnum } from "./enums.js";
import { plans } from "./plans.js";
import { users } from "./users.js";

export const subscriptions = pgTable("subscriptions", {
  id:     uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id),

  stripeCustomerId:     text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status:   subscriptionStatusEnum("status").notNull().default("active"),
  interval: billingIntervalEnum("interval").notNull().default("monthly"),

  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
  currentPeriodEnd:   timestamp("current_period_end",   { withTimezone: true }).notNull(),
  cancelAtPeriodEnd:  timestamp("cancel_at_period_end", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx:            index("subs_user_id_idx").on(t.userId),
  stripeSubIdx:         uniqueIndex("subs_stripe_sub_idx").on(t.stripeSubscriptionId),
  stripeCustomerIdx:    index("subs_stripe_customer_idx").on(t.stripeCustomerId),
  statusIdx:            index("subs_status_idx").on(t.status),
  periodEndIdx:         index("subs_period_end_idx").on(t.currentPeriodEnd),
}));

export type Subscription    = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
