import { db } from "@maschina/db";
import { subscriptions, plans } from "@maschina/db";
import { eq } from "@maschina/db";
import { getStripe } from "./client.js";
import { getOrCreateStripeCustomer } from "./customers.js";
import type { BillingInterval, CheckoutResult, PortalResult, SubscriptionResult } from "./types.js";
import type { PlanTier } from "@maschina/plans";

// ─── Resolve Stripe price for a plan tier + interval ─────────────────────────

async function getPriceId(tier: PlanTier, interval: BillingInterval): Promise<string> {
  const [plan] = await db
    .select({
      monthly: plans.stripePriceIdMonthly,
      annual:  plans.stripePriceIdAnnual,
    })
    .from(plans)
    .where(eq(plans.tier, tier))
    .limit(1);

  const priceId = interval === "annual" ? plan?.annual : plan?.monthly;
  if (!priceId) {
    throw new Error(`No Stripe price configured for tier=${tier} interval=${interval}`);
  }
  return priceId;
}

// ─── Create subscription via Stripe Checkout ─────────────────────────────────
// We use Checkout (hosted page) rather than Payment Elements for simplicity and
// PCI compliance. Stripe handles all card details — we never touch them.

export async function createSubscriptionCheckout(opts: {
  userId: string;
  email: string;
  name?: string | null;
  tier: PlanTier;
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutResult> {
  const stripe = getStripe();
  const stripeCustomerId = await getOrCreateStripeCustomer(opts.userId, opts.email, opts.name);
  const priceId = await getPriceId(opts.tier, opts.interval);

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    subscription_data: {
      metadata: {
        maschinaUserId: opts.userId,
        tier: opts.tier,
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  return { checkoutUrl: session.url!, sessionId: session.id };
}

// ─── Upgrade / downgrade (immediate proration via Stripe) ─────────────────────

export async function changeSubscriptionTier(opts: {
  userId: string;
  newTier: PlanTier;
  interval: BillingInterval;
}): Promise<SubscriptionResult> {
  const stripe = getStripe();

  const [sub] = await db
    .select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, opts.userId))
    .limit(1);

  if (!sub?.stripeSubscriptionId) {
    throw new Error("No active Stripe subscription found");
  }

  const priceId = await getPriceId(opts.newTier, opts.interval);

  // Fetch current subscription to get the item ID
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
  const itemId = stripeSub.items.data[0]?.id;
  if (!itemId) throw new Error("Subscription has no line items");

  // Update price with immediate proration — Stripe handles the math
  const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: "create_prorations",
    metadata: { tier: opts.newTier },
  });

  return {
    subscriptionId: updated.id,
    status: updated.status as SubscriptionResult["status"],
    currentPeriodEnd: new Date(updated.current_period_end * 1000),
    tier: opts.newTier,
  };
}

// ─── Cancel at period end ─────────────────────────────────────────────────────
// We never cancel immediately — always let the user use what they paid for.

export async function cancelSubscription(userId: string): Promise<void> {
  const stripe = getStripe();

  const [sub] = await db
    .select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!sub?.stripeSubscriptionId) return; // already on free, nothing to cancel

  await stripe.subscriptions.update(sub.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}

// ─── Customer portal (self-serve billing management) ─────────────────────────
// Stripe's hosted portal lets users update payment methods, download invoices,
// and manage their subscription without us building any of that UI.

export async function createPortalSession(opts: {
  userId: string;
  returnUrl: string;
}): Promise<PortalResult> {
  const stripe = getStripe();

  const [sub] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, opts.userId))
    .limit(1);

  if (!sub?.stripeCustomerId) {
    throw new Error("No Stripe customer found");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: opts.returnUrl,
  });

  return { portalUrl: session.url };
}
