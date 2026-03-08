import type { PlanTier } from "@maschina/plans";

export type BillingInterval = "monthly" | "annual";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

// ─── Credit packages (top-up purchases) ──────────────────────────────────────

export interface CreditPackage {
  id: string;
  name: string;
  tokens: number; // model tokens granted
  priceUsd: number; // price in cents
  stripePriceId: string; // pre-created in Stripe dashboard
}

// Standard credit packs — expand as needed
export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: "tokens_1m",
    name: "1M Tokens",
    tokens: 1_000_000,
    priceUsd: 1000, // $10.00
    stripePriceId: process.env.STRIPE_CREDIT_PRICE_1M ?? "",
  },
  {
    id: "tokens_5m",
    name: "5M Tokens",
    tokens: 5_000_000,
    priceUsd: 4000, // $40.00
    stripePriceId: process.env.STRIPE_CREDIT_PRICE_5M ?? "",
  },
  {
    id: "tokens_20m",
    name: "20M Tokens",
    tokens: 20_000_000,
    priceUsd: 12000, // $120.00
    stripePriceId: process.env.STRIPE_CREDIT_PRICE_20M ?? "",
  },
];

// ─── Subscription results ─────────────────────────────────────────────────────

export interface CheckoutResult {
  /** Stripe Checkout Session URL — redirect the user here */
  checkoutUrl: string;
  sessionId: string;
}

export interface PortalResult {
  /** Stripe Customer Portal URL — redirect the user here for self-serve management */
  portalUrl: string;
}

export interface SubscriptionResult {
  subscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  tier: PlanTier;
}
