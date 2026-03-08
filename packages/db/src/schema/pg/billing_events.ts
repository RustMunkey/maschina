import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Idempotent Stripe webhook event log — never delete
export const billingEvents = pgTable("billing_events", {
  id:             uuid("id").primaryKey().defaultRandom(),
  stripeEventId:  text("stripe_event_id").notNull().unique(), // idempotency key
  type:           text("type").notNull(),   // "invoice.paid" | "subscription.updated"
  payload:        jsonb("payload").notNull(),
  processed:      boolean("processed").notNull().default(false),
  processedAt:    timestamp("processed_at", { withTimezone: true }),
  error:          text("error"),
  createdAt:      timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  stripeEventIdx:   uniqueIndex("billing_events_stripe_idx").on(t.stripeEventId),
  processedIdx:     index("billing_events_processed_idx").on(t.processed),
  typeIdx:          index("billing_events_type_idx").on(t.type),
}));

export type BillingEvent    = typeof billingEvents.$inferSelect;
export type NewBillingEvent = typeof billingEvents.$inferInsert;
