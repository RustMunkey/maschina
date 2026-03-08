import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "pending_review",
  "active",
  "suspended",
  "archived",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "completed",
  "refunded",
  "disputed",
]);

export const marketplaceListings = pgTable("marketplace_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  category: text("category").notNull(),
  tags: jsonb("tags").notNull().default([]),

  // Pricing
  priceUsdc: numeric("price_usdc", { precision: 18, scale: 6 }),  // on-chain price (Solana)
  priceUsd: integer("price_usd"),                                   // fiat price in cents
  isFree: boolean("is_free").notNull().default(false),

  status: listingStatusEnum("status").notNull().default("draft"),
  downloads: integer("downloads").notNull().default(0),
  rating: numeric("rating", { precision: 3, scale: 2 }),
  ratingCount: integer("rating_count").notNull().default(0),

  // on-chain
  onChainListingId: text("on_chain_listing_id"),  // Solana program listing PDA

  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const marketplaceOrders = pgTable("marketplace_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => marketplaceListings.id),
  buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  status: orderStatusEnum("status").notNull().default("pending"),
  amountUsdc: numeric("amount_usdc", { precision: 18, scale: 6 }),
  amountUsd: integer("amount_usd"),

  txSignature: text("tx_signature"),    // Solana transaction signature
  stripePaymentIntentId: text("stripe_payment_intent_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const marketplaceReviews = pgTable("marketplace_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => marketplaceListings.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => marketplaceOrders.id),
  rating: integer("rating").notNull(),  // 1–5
  body: text("body"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type MarketplaceOrder = typeof marketplaceOrders.$inferSelect;
export type MarketplaceReview = typeof marketplaceReviews.$inferSelect;
