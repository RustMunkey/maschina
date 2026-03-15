// Types
export type {
  BillingInterval,
  SubscriptionStatus,
  CreditPackage,
  CheckoutResult,
  PortalResult,
  SubscriptionResult,
} from "./types.js";
export { CREDIT_PACKAGES } from "./types.js";

// Stripe client
export { getStripe } from "./client.js";

// Customers
export { getOrCreateStripeCustomer, updateStripeCustomer } from "./customers.js";

// Subscriptions
export {
  createSubscriptionCheckout,
  changeSubscriptionTier,
  cancelSubscription,
  createPortalSession,
} from "./subscriptions.js";

// Credits
export {
  createCreditCheckout,
  getCreditBalance,
  addCredits,
  consumeCredits,
} from "./credits.js";

// Webhooks
export { constructWebhookEvent, handleWebhookEvent } from "./webhooks.js";

// Marketplace payments
export { createMarketplacePaymentIntent, calcMarketplaceRevenue } from "./marketplace.js";
export type { MarketplacePaymentResult } from "./marketplace.js";

// Pricing rates + top-up options
export {
  PRICING_RATES,
  TOPUP_OPTIONS,
  MIN_TOPUP_CENTS,
  DEFAULT_RECHARGE_THRESHOLD_CENTS,
  DEFAULT_RECHARGE_AMOUNT_CENTS,
  calculateCost,
} from "./pricing.js";
export type { PricingRates, TopUpOption } from "./pricing.js";
