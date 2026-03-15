import { db } from "@maschina/db";
import { marketplaceListings, marketplaceOrders } from "@maschina/db";
import { eq } from "@maschina/db";
import { getStripe } from "./client.js";
import { getOrCreateStripeCustomer } from "./customers.js";

const SELLER_SHARE = 0.7;

export interface MarketplacePaymentResult {
  clientSecret: string;
  paymentIntentId: string;
  orderId: string;
}

// ─── Revenue share ────────────────────────────────────────────────────────────

export function calcMarketplaceRevenue(amountCents: number): {
  sellerCents: number;
  platformCents: number;
} {
  const sellerCents = Math.floor(amountCents * SELLER_SHARE);
  return { sellerCents, platformCents: amountCents - sellerCents };
}

// ─── Create Stripe PaymentIntent for a paid listing purchase ─────────────────
// Returns a client_secret the frontend uses to confirm the payment.
// A pending marketplaceOrders row is created immediately.
// Fulfillment (agent fork + seller credit) fires in the payment_intent.succeeded webhook.

export async function createMarketplacePaymentIntent(opts: {
  buyerId: string;
  buyerEmail: string;
  listingId: string;
}): Promise<MarketplacePaymentResult> {
  const [listing] = await db
    .select()
    .from(marketplaceListings)
    .where(eq(marketplaceListings.id, opts.listingId))
    .limit(1);

  if (!listing) throw new Error("Listing not found");
  if (listing.status !== "active") throw new Error("Listing is not active");
  if (!listing.priceUsd || listing.priceUsd <= 0) {
    throw new Error("This listing is free — use /fork instead");
  }
  if (listing.sellerId === opts.buyerId) {
    throw new Error("Cannot purchase your own listing");
  }

  // Create a pending order up front — completed in webhook on payment success
  const [order] = await db
    .insert(marketplaceOrders)
    .values({
      listingId: opts.listingId,
      buyerId: opts.buyerId,
      sellerId: listing.sellerId,
      status: "pending",
      amountUsd: listing.priceUsd,
    })
    .returning({ id: marketplaceOrders.id });

  const stripeCustomerId = await getOrCreateStripeCustomer(opts.buyerId, opts.buyerEmail);

  const pi = await getStripe().paymentIntents.create({
    amount: listing.priceUsd, // stored in cents
    currency: "usd",
    customer: stripeCustomerId,
    metadata: {
      maschinaProduct: "marketplace_listing",
      maschinaOrderId: order.id,
      maschinaListingId: opts.listingId,
      maschinaSellerUserId: listing.sellerId,
      maschinaUserId: opts.buyerId,
    },
  });

  await db
    .update(marketplaceOrders)
    .set({ stripePaymentIntentId: pi.id })
    .where(eq(marketplaceOrders.id, order.id));

  if (!pi.client_secret) throw new Error("Stripe did not return a client_secret");

  return { clientSecret: pi.client_secret, paymentIntentId: pi.id, orderId: order.id };
}
