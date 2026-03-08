import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const walletNetworkEnum = pgEnum("wallet_network", [
  "solana_mainnet",
  "solana_devnet",
  "solana_testnet",
]);

export const walletAddresses = pgTable("wallet_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  orgId: uuid("org_id"),

  network: walletNetworkEnum("network").notNull(),
  address: text("address").notNull(),
  label: text("label"),
  isPrimary: boolean("is_primary").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WalletAddress = typeof walletAddresses.$inferSelect;
export type NewWalletAddress = typeof walletAddresses.$inferInsert;
