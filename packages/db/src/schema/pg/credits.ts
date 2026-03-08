import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { creditTxTypeEnum } from "./enums.js";
import { users } from "./users.js";

// Append-only ledger — never update rows, only insert
export const creditTransactions = pgTable("credit_transactions", {
  id:     uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  type:           creditTxTypeEnum("type").notNull(),
  amount:         integer("amount").notNull(),         // positive = credit, negative = debit
  balanceAfter:   integer("balance_after").notNull(),  // denormalized for audit trail

  stripePaymentIntentId: text("stripe_payment_intent_id"),
  description:           text("description"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx:    index("credits_user_id_idx").on(t.userId),
  createdAtIdx: index("credits_created_at_idx").on(t.createdAt),
  stripeIdx:    index("credits_stripe_idx").on(t.stripePaymentIntentId),
}));

// Denormalized current balance — updated atomically with each transaction
export const creditBalances = pgTable("credit_balances", {
  userId:    uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  balance:   integer("balance").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CreditTransaction    = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;
export type CreditBalance        = typeof creditBalances.$inferSelect;
