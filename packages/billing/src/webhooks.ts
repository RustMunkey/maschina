import { db } from "@maschina/db";
import {
  agents,
  billingEvents,
  marketplaceListings,
  marketplaceOrders,
  plans,
  subscriptions,
} from "@maschina/db";
import { eq, sql } from "@maschina/db";
import type { PlanTier } from "@maschina/plans";
import type Stripe from "stripe";
import { getStripe } from "./client.js";
import { addCredits } from "./credits.js";
import { calcMarketplaceRevenue } from "./marketplace.js";
import { CREDIT_PACKAGES } from "./types.js";

// ─── Webhook signature verification ──────────────────────────────────────────
// Must be called before processing any event.
// `rawBody` must be the raw Buffer/string — not JSON.parse()'d.

export function constructWebhookEvent(rawBody: string | Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}

// ─── Main webhook handler ─────────────────────────────────────────────────────
// Called from POST /webhooks/stripe in services/api.
// All events are logged to billing_events with idempotency (stripeEventId unique).
// Returns the event type so the caller can log it.

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  // Idempotency: skip if we've already processed this event
  const [existing] = await db
    .select({ id: billingEvents.id, processed: billingEvents.processed })
    .from(billingEvents)
    .where(eq(billingEvents.stripeEventId, event.id))
    .limit(1);

  if (existing?.processed) return; // already handled

  // Log the event (insert or ignore if already logged)
  if (!existing) {
    await db
      .insert(billingEvents)
      .values({
        stripeEventId: event.id,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
        processed: false,
      })
      .onConflictDoNothing();
  }

  // Process
  let error: string | null = null;
  try {
    await routeEvent(event);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    // Mark as failed but don't throw — Stripe will retry on non-2xx, but we've
    // already logged so retries will be idempotent
    console.error(`[billing] Failed to process event ${event.type} (${event.id}):`, error);
  }

  // Mark processed (success or failure recorded)
  await db
    .update(billingEvents)
    .set({ processed: true, processedAt: new Date(), error })
    .where(eq(billingEvents.stripeEventId, event.id));

  if (error) throw new Error(error); // re-throw so services/api returns 500 → Stripe retries
}

// ─── Event routing ────────────────────────────────────────────────────────────

async function routeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;

    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;

    default:
      // Unhandled events are logged but not processed — no error
      break;
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleSubscriptionUpsert(stripeSub: Stripe.Subscription): Promise<void> {
  const userId = stripeSub.metadata.maschinaUserId;
  if (!userId) throw new Error("No maschinaUserId in subscription metadata");

  const tier = (stripeSub.metadata.tier ?? "free") as PlanTier;

  const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.tier, tier)).limit(1);

  if (!plan) throw new Error(`Plan not found for tier: ${tier}`);

  await db
    .insert(subscriptions)
    .values({
      userId,
      planId: plan.id,
      stripeCustomerId: stripeSub.customer as string,
      stripeSubscriptionId: stripeSub.id,
      status: stripeSub.status as any,
      interval: stripeSub.items.data[0]?.plan.interval === "year" ? "annual" : "monthly",
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : null,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        planId: plan.id,
        status: stripeSub.status as any,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end
          ? new Date(stripeSub.current_period_end * 1000)
          : null,
        updatedAt: new Date(),
      },
    });
}

async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
  // Revert to free plan when subscription is fully canceled
  const userId = stripeSub.metadata.maschinaUserId;
  if (!userId) return;

  const [freePlan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.tier, "access"))
    .limit(1);

  if (!freePlan) return;

  await db
    .update(subscriptions)
    .set({
      planId: freePlan.id,
      status: "canceled",
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id));
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  // Subscription period renewal — keep subscription active
  if (!invoice.subscription) return;

  await db
    .update(subscriptions)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, invoice.subscription as string));
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) return;

  await db
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, invoice.subscription as string));

  // TODO: emit notification event → packages/notifications sends "payment failed" email
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // Only handle one-time credit purchases (mode: "payment")
  // Subscription checkouts are handled via subscription.created webhook
  if (session.mode !== "payment") return;

  const paymentIntentId = session.payment_intent as string;
  const userId = session.metadata?.maschinaUserId ?? session.client_reference_id;
  if (!userId) throw new Error("No userId in checkout session metadata");

  // Retrieve PaymentIntent to get our metadata
  const pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
  const packageId = pi.metadata.creditPackageId;
  const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);

  if (!pkg) throw new Error(`Unknown credit package: ${packageId}`);

  await addCredits({
    userId,
    tokens: pkg.tokens,
    stripePaymentIntentId: paymentIntentId,
    description: `Top-up: ${pkg.name}`,
  });
}

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  // Only handle marketplace listing purchases
  if (pi.metadata.maschinaProduct !== "marketplace_listing") return;

  const {
    maschinaOrderId: orderId,
    maschinaListingId: listingId,
    maschinaSellerUserId: sellerId,
    maschinaUserId: buyerId,
  } = pi.metadata;
  if (!orderId || !listingId || !sellerId || !buyerId) {
    throw new Error("Missing marketplace metadata on PaymentIntent");
  }

  const [order] = await db
    .select()
    .from(marketplaceOrders)
    .where(eq(marketplaceOrders.id, orderId))
    .limit(1);

  // Idempotent — already fulfilled
  if (!order || order.status === "completed") return;

  // Complete the order
  await db
    .update(marketplaceOrders)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(marketplaceOrders.id, orderId));

  // Credit seller 70% of the sale amount (stored in cents)
  const { sellerCents } = calcMarketplaceRevenue(order.amountUsd ?? 0);
  await addCredits({
    userId: sellerId,
    tokens: sellerCents,
    stripePaymentIntentId: pi.id,
    description: `Marketplace sale: listing ${listingId}`,
  });

  // Increment download counter on the listing
  const [listing] = await db
    .select()
    .from(marketplaceListings)
    .where(eq(marketplaceListings.id, listingId))
    .limit(1);

  if (!listing) return;

  await db
    .update(marketplaceListings)
    .set({ downloads: sql`${marketplaceListings.downloads} + 1`, updatedAt: new Date() })
    .where(eq(marketplaceListings.id, listingId));

  // Fork the agent config as a new agent owned by the buyer
  await db.insert(agents).values({
    userId: buyerId,
    name: `${listing.name} (purchased)`,
    description: listing.description ?? null,
    type:
      ((listing.agentConfig as Record<string, unknown>)
        ?.type as (typeof agents.$inferInsert)["type"]) ?? "execution",
    config: listing.agentConfig ?? {},
    status: "idle",
  });
}
