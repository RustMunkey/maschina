import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { plans } from "./plans.js";
import { users } from "./users.js";

export const subscriptions = sqliteTable("subscriptions", {
  id:     text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id),

  stripeCustomerId:     text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status:   text("status", { enum: ["active","past_due","canceled","incomplete","trialing","paused"] }).notNull().default("active"),
  interval: text("interval", { enum: ["monthly", "annual"] }).notNull().default("monthly"),

  currentPeriodStart: integer("current_period_start", { mode: "timestamp" }).notNull(),
  currentPeriodEnd:   integer("current_period_end",   { mode: "timestamp" }).notNull(),
  cancelAtPeriodEnd:  integer("cancel_at_period_end", { mode: "timestamp" }),
  createdAt:          integer("created_at",            { mode: "timestamp" }).notNull(),
  updatedAt:          integer("updated_at",            { mode: "timestamp" }).notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
