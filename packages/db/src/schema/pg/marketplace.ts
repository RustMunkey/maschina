import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { listingStatusEnum, orderStatusEnum } from "./enums.js";
import { users } from "./users.js";

export const marketplaceListings = pgTable(
  "marketplace_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    category: text("category").notNull(),
    tags: jsonb("tags").notNull().default([]),

    priceUsdc: numeric("price_usdc", { precision: 18, scale: 6 }),
    priceUsd: integer("price_usd"),

    status: listingStatusEnum("status").notNull().default("draft"),
    downloads: integer("downloads").notNull().default(0),
    rating: numeric("rating", { precision: 3, scale: 2 }),
    ratingCount: integer("rating_count").notNull().default(0),

    onChainListingId: text("on_chain_listing_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: index("listings_slug_idx").on(t.slug),
    sellerIdx: index("listings_seller_idx").on(t.sellerId),
    statusIdx: index("listings_status_idx").on(t.status),
    categoryIdx: index("listings_category_idx").on(t.category),
  }),
);

export const marketplaceOrders = pgTable(
  "marketplace_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    status: orderStatusEnum("status").notNull().default("pending"),
    amountUsdc: numeric("amount_usdc", { precision: 18, scale: 6 }),
    amountUsd: integer("amount_usd"),
    txSignature: text("tx_signature"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    buyerIdx: index("orders_buyer_idx").on(t.buyerId),
    sellerIdx: index("orders_seller_idx").on(t.sellerId),
    statusIdx: index("orders_status_idx").on(t.status),
  }),
);

export const marketplaceReviews = pgTable(
  "marketplace_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => marketplaceOrders.id),
    rating: integer("rating").notNull(), // 1–5
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    listingIdx: index("reviews_listing_idx").on(t.listingId),
    reviewerIdx: index("reviews_reviewer_idx").on(t.reviewerId),
  }),
);

export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type MarketplaceOrder = typeof marketplaceOrders.$inferSelect;
export type MarketplaceReview = typeof marketplaceReviews.$inferSelect;
