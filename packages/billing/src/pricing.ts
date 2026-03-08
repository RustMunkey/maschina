// ─── Per-action pricing rates ─────────────────────────────────────────────────
// Used to deduct from a user's prepaid balance when their plan quota runs out.
// All values in cents (USD). $0.01 = 1 cent.
//
// These are YOUR prices charged to users — not your inference cost.
// Your margin = user price − inference cost.
// Inference cost benchmark (GLM-4 class): ~$0.50–1.00 per 1M tokens.
// These rates price at ~$2.00/1M tokens → healthy margin at scale.
//
// Adjust before launch once you have real inference cost data.

export interface PricingRates {
  /** Cost per 1,000 model tokens (input + output combined), in cents */
  modelTokensPer1k: number;
  /** Cost per agent execution, in cents */
  agentExecution: number;
  /** Cost per API call, in cents */
  apiCall: number;
  /** Cost per GB of storage per month, in cents */
  storageGbPerMonth: number;
}

// Standard rates — apply to all tiers equally when drawing from balance
export const PRICING_RATES: PricingRates = {
  modelTokensPer1k:  0.2,   // $0.002 / 1k tokens = $2.00 / 1M tokens
  agentExecution:    1,     // $0.01 per agent run
  apiCall:           0.01,  // $0.0001 per API call (basically free, counted for abuse)
  storageGbPerMonth: 10,    // $0.10/GB/month (similar to S3 standard)
};

// Minimum prepaid balance top-up — matches Anthropic's $5 minimum
export const MIN_TOPUP_CENTS = 500; // $5.00

// Auto-recharge threshold and amount defaults
export const DEFAULT_RECHARGE_THRESHOLD_CENTS = 500;  // recharge when balance < $5
export const DEFAULT_RECHARGE_AMOUNT_CENTS     = 2000; // charge $20 on recharge

/**
 * Calculate the cost in cents for a given usage amount.
 */
export function calculateCost(
  type: "modelTokens" | "agentExecution" | "apiCall" | "storageGb",
  amount: number,
): number {
  switch (type) {
    case "modelTokens":
      return Math.ceil((amount / 1000) * PRICING_RATES.modelTokensPer1k);
    case "agentExecution":
      return Math.ceil(amount * PRICING_RATES.agentExecution);
    case "apiCall":
      return Math.ceil(amount * PRICING_RATES.apiCall);
    case "storageGb":
      return Math.ceil(amount * PRICING_RATES.storageGbPerMonth);
  }
}

// ─── Balance top-up packages (pre-defined amounts users can add) ──────────────
// No token "packs" — just dollar amounts. Clean, like Anthropic.

export interface TopUpOption {
  id: string;
  displayAmount: string;    // "$10"
  cents: number;
  stripePriceId: string;    // one-time price pre-created in Stripe dashboard
}

export const TOPUP_OPTIONS: TopUpOption[] = [
  { id: "topup_5",   displayAmount: "$5",   cents: 500,   stripePriceId: process.env["STRIPE_TOPUP_500"]   ?? "" },
  { id: "topup_10",  displayAmount: "$10",  cents: 1000,  stripePriceId: process.env["STRIPE_TOPUP_1000"]  ?? "" },
  { id: "topup_20",  displayAmount: "$20",  cents: 2000,  stripePriceId: process.env["STRIPE_TOPUP_2000"]  ?? "" },
  { id: "topup_50",  displayAmount: "$50",  cents: 5000,  stripePriceId: process.env["STRIPE_TOPUP_5000"]  ?? "" },
  { id: "topup_100", displayAmount: "$100", cents: 10000, stripePriceId: process.env["STRIPE_TOPUP_10000"] ?? "" },
];
