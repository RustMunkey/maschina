import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const creditTxTypeEnum = pgEnum("credit_tx_type", [
  "purchase",    // user bought top-up credits
  "usage",       // credits consumed by usage
  "refund",      // refunded credits
  "bonus",       // promotional credits
  "adjustment",  // manual admin adjustment
]);

export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  type: creditTxTypeEnum("type").notNull(),
  amount: integer("amount").notNull(),          // positive = credit, negative = debit
  balanceAfter: integer("balance_after").notNull(),

  stripePaymentIntentId: text("stripe_payment_intent_id"),
  description: text("description"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Current balance (denormalized for fast reads)
export const creditBalances = pgTable("credit_balances", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;
export type CreditBalance = typeof creditBalances.$inferSelect;
