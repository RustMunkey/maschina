import type { PlanConfig, PlanTier, SeatBracket } from "./types.js";

// ─── Maschina Plans ───────────────────────────────────────────────────────────
// annualPriceCents = total charged upfront for the year (what Stripe bills).
// annualMonthlyRateCents = annualPriceCents / 12 (shown in UI as "per month").
//
// Mach Team is per-seat. Use getTeamSeatPrice() to get volume-adjusted pricing.
// 25+ seats → redirect to Enterprise (contact sales).

export const PLANS: Record<PlanTier, PlanConfig> = {

  // ─── Access ───────────────────────────────────────────────────────────────
  // Free forever. No card required. Local Ollama only. Onboarding hook.
  access: {
    tier:                  "access",
    name:                  "Access",
    fullName:              "Maschina Access",
    badge:                 "Free",
    monthlyPriceCents:     0,
    annualPriceCents:      0,
    annualMonthlyRateCents: 0,
    perSeat:               false,
    monthlyAgentExecutions: 50,
    monthlyApiCalls:        500,
    monthlyModelTokens:     0,     // no Maschina model — bring your own Ollama
    maxAgents:              1,
    maxApiKeys:             0,
    maxTeamMembers:         1,
    maxConnectors:          1,
    storageGb:              1,
    features: {
      localExecution:   true,
      cloudExecution:   false,
      maschinaModel:    false,
      marketplace:      false,
      analytics:        false,
      compliance:       false,
      prioritySupport:  false,
      customConnectors: false,
      webhooks:         false,
      sla:              false,
      onPrem:           false,
      dedicatedInfra:   false,
      rbac:             false,
      sharedAgentPool:  false,
      workflowAutomation: false,
      teamDashboard:    false,
    },
  },

  // ─── Mach-1 (M1) ─────────────────────────────────────────────────────────
  // Entry paid tier. $20/mo or $204/yr ($17/mo effective).
  m1: {
    tier:                  "m1",
    name:                  "Mach-1",
    fullName:              "Maschina Mach-1",
    badge:                 "M1",
    monthlyPriceCents:     2000,   // $20.00/mo
    annualPriceCents:      20400,  // $204.00/yr
    annualMonthlyRateCents: 1700,  // $17.00/mo effective
    perSeat:               false,
    monthlyAgentExecutions: 500,
    monthlyApiCalls:        5_000,
    monthlyModelTokens:     500_000,   // ~250 chat turns
    maxAgents:              3,
    maxApiKeys:             3,
    maxTeamMembers:         1,
    maxConnectors:          3,
    storageGb:              5,
    features: {
      localExecution:   true,
      cloudExecution:   true,
      maschinaModel:    true,
      marketplace:      true,
      analytics:        false,
      compliance:       false,
      prioritySupport:  false,
      customConnectors: false,
      webhooks:         true,
      sla:              false,
      onPrem:           false,
      dedicatedInfra:   false,
      rbac:             false,
      sharedAgentPool:  false,
      workflowAutomation: false,
      teamDashboard:    false,
    },
  },

  // ─── Mach-5 (M5) ─────────────────────────────────────────────────────────
  // Main individual tier. $60/mo or $600/yr ($50/mo effective).
  m5: {
    tier:                  "m5",
    name:                  "Mach-5",
    fullName:              "Maschina Mach-5",
    badge:                 "M5",
    monthlyPriceCents:     6000,   // $60.00/mo
    annualPriceCents:      60000,  // $600.00/yr
    annualMonthlyRateCents: 5000,  // $50.00/mo effective
    perSeat:               false,
    monthlyAgentExecutions: 2_000,
    monthlyApiCalls:        20_000,
    monthlyModelTokens:     2_000_000,  // ~1,000 chat turns
    maxAgents:              10,
    maxApiKeys:             10,
    maxTeamMembers:         1,
    maxConnectors:          10,
    storageGb:              25,
    features: {
      localExecution:   true,
      cloudExecution:   true,
      maschinaModel:    true,
      marketplace:      true,
      analytics:        true,
      compliance:       false,
      prioritySupport:  false,
      customConnectors: true,
      webhooks:         true,
      sla:              false,
      onPrem:           false,
      dedicatedInfra:   false,
      rbac:             false,
      sharedAgentPool:  false,
      workflowAutomation: false,
      teamDashboard:    false,
    },
  },

  // ─── Mach-10 (M10) ───────────────────────────────────────────────────────
  // Power user tier. $100/mo or $995/yr ($83/mo effective).
  m10: {
    tier:                  "m10",
    name:                  "Mach-10",
    fullName:              "Maschina Mach-10",
    badge:                 "M10",
    monthlyPriceCents:     10000,  // $100.00/mo
    annualPriceCents:      99500,  // $995.00/yr
    annualMonthlyRateCents: 8292,  // ~$82.92/mo effective
    perSeat:               false,
    monthlyAgentExecutions: 10_000,
    monthlyApiCalls:        100_000,
    monthlyModelTokens:     10_000_000,  // ~5,000 chat turns
    maxAgents:              50,
    maxApiKeys:             25,
    maxTeamMembers:         1,      // solo power user — upgrade to Mach Team for collaboration
    maxConnectors:          25,
    storageGb:              100,
    features: {
      localExecution:   true,
      cloudExecution:   true,
      maschinaModel:    true,
      marketplace:      true,
      analytics:        true,
      compliance:       true,
      prioritySupport:  true,
      customConnectors: true,
      webhooks:         true,
      sla:              false,
      onPrem:           false,
      dedicatedInfra:   false,
      rbac:             false,
      sharedAgentPool:  false,
      workflowAutomation: false,
      teamDashboard:    false,
    },
  },

  // ─── Mach Team ────────────────────────────────────────────────────────────
  // Per-seat. $30/seat/mo or $300/seat/yr ($25/seat/mo effective).
  // Volume discounts apply at 10+ seats — use getTeamSeatPrice() for checkout.
  // 25+ seats → redirect to Enterprise.
  // Workspace limits scale with seat count; base figures below assume ~10 seats.
  teams: {
    tier:                  "teams",
    name:                  "Mach Team",
    fullName:              "Maschina Mach Team",
    badge:                 "MT",
    monthlyPriceCents:     3000,   // $30.00/seat/mo (base rate, 1-9 seats)
    annualPriceCents:      30000,  // $300.00/seat/yr
    annualMonthlyRateCents: 2500,  // $25.00/seat/mo effective
    perSeat:               true,
    monthlyAgentExecutions: 50_000,
    monthlyApiCalls:        500_000,
    monthlyModelTokens:     50_000_000,
    maxAgents:              200,
    maxApiKeys:             100,
    maxTeamMembers:         24,    // 25+ seats → Enterprise
    maxConnectors:          100,
    storageGb:              500,
    features: {
      localExecution:   true,
      cloudExecution:   true,
      maschinaModel:    true,
      marketplace:      true,
      analytics:        true,
      compliance:       true,
      prioritySupport:  true,
      customConnectors: true,
      webhooks:         true,
      sla:              false,
      onPrem:           false,
      dedicatedInfra:   false,
      rbac:             true,
      sharedAgentPool:  true,
      workflowAutomation: true,
      teamDashboard:    true,
    },
  },

  // ─── Enterprise ───────────────────────────────────────────────────────────
  // Custom pricing. Contact sales. Everything unlimited.
  enterprise: {
    tier:                  "enterprise",
    name:                  "Enterprise",
    fullName:              "Maschina Enterprise",
    badge:                 "ENT",
    monthlyPriceCents:     -1,
    annualPriceCents:      -1,
    annualMonthlyRateCents: -1,
    perSeat:               false,
    monthlyAgentExecutions: -1,
    monthlyApiCalls:        -1,
    monthlyModelTokens:     -1,
    maxAgents:              -1,
    maxApiKeys:             -1,
    maxTeamMembers:         -1,
    maxConnectors:          -1,
    storageGb:              -1,
    features: {
      localExecution:   true,
      cloudExecution:   true,
      maschinaModel:    true,
      marketplace:      true,
      analytics:        true,
      compliance:       true,
      prioritySupport:  true,
      customConnectors: true,
      webhooks:         true,
      sla:              true,
      onPrem:           true,
      dedicatedInfra:   true,
      rbac:             true,
      sharedAgentPool:  true,
      workflowAutomation: true,
      teamDashboard:    true,
    },
  },

  // ─── Internal ─────────────────────────────────────────────────────────────
  // Asher + Maschina team only. Unlimited everything. Never shown publicly.
  // Assigned manually in DB — no Stripe subscription, no billing, no quota checks.
  internal: {
    tier:                  "internal",
    name:                  "Internal",
    fullName:              "Maschina Internal",
    badge:                 "INT",
    monthlyPriceCents:     0,
    annualPriceCents:      0,
    annualMonthlyRateCents: 0,
    perSeat:               false,
    monthlyAgentExecutions: -1,
    monthlyApiCalls:        -1,
    monthlyModelTokens:     -1,
    maxAgents:              -1,
    maxApiKeys:             -1,
    maxTeamMembers:         -1,
    maxConnectors:          -1,
    storageGb:              -1,
    features: {
      localExecution:   true,
      cloudExecution:   true,
      maschinaModel:    true,
      marketplace:      true,
      analytics:        true,
      compliance:       true,
      prioritySupport:  true,
      customConnectors: true,
      webhooks:         true,
      sla:              true,
      onPrem:           true,
      dedicatedInfra:   true,
      rbac:             true,
      sharedAgentPool:  true,
      workflowAutomation: true,
      teamDashboard:    true,
    },
  },
};

export const PLAN_TIERS: PlanTier[] = ["access", "m1", "m5", "m10", "teams", "enterprise", "internal"];

// ─── Mach Team volume seat brackets ──────────────────────────────────────────
// Prices are per seat. 25+ seats → Enterprise (null = contact sales).
export const TEAM_SEAT_BRACKETS: SeatBracket[] = [
  {
    minSeats:                      1,
    maxSeats:                      9,
    monthlyPerSeatCents:           3000,  // $30.00/seat/mo
    annualPerSeatTotalCents:       30000, // $300.00/seat/yr
    annualPerSeatMonthlyRateCents: 2500,  // $25.00/seat/mo effective
  },
  {
    minSeats:                      10,
    maxSeats:                      24,
    monthlyPerSeatCents:           2700,  // $27.00/seat/mo (10% off)
    annualPerSeatTotalCents:       27000, // $270.00/seat/yr
    annualPerSeatMonthlyRateCents: 2250,  // $22.50/seat/mo effective
  },
  {
    minSeats:                      25,
    maxSeats:                      null,  // open-ended → Enterprise
    monthlyPerSeatCents:           null,
    annualPerSeatTotalCents:       null,
    annualPerSeatMonthlyRateCents: null,
  },
];

/**
 * Returns the applicable seat bracket for a given seat count.
 * If seats >= 25, returns the Enterprise redirect bracket (all prices null).
 */
export function getTeamSeatBracket(seats: number): SeatBracket {
  const bracket = TEAM_SEAT_BRACKETS.find(
    (b) => seats >= b.minSeats && (b.maxSeats === null || seats <= b.maxSeats),
  );
  // Should always find a match given the open-ended last bracket
  return bracket ?? TEAM_SEAT_BRACKETS[TEAM_SEAT_BRACKETS.length - 1]!;
}

/**
 * Total monthly charge in cents for a Mach Team subscription.
 * Returns null if seat count falls in the Enterprise redirect bracket (25+).
 */
export function getTeamMonthlyTotal(seats: number): number | null {
  const bracket = getTeamSeatBracket(seats);
  if (bracket.monthlyPerSeatCents === null) return null;
  return bracket.monthlyPerSeatCents * seats;
}

/**
 * Total annual charge in cents for a Mach Team subscription.
 * Returns null if seat count falls in the Enterprise redirect bracket (25+).
 */
export function getTeamAnnualTotal(seats: number): number | null {
  const bracket = getTeamSeatBracket(seats);
  if (bracket.annualPerSeatTotalCents === null) return null;
  return bracket.annualPerSeatTotalCents * seats;
}

export function getPlan(tier: PlanTier): PlanConfig {
  return PLANS[tier];
}

export function isValidTier(tier: string): tier is PlanTier {
  return PLAN_TIERS.includes(tier as PlanTier);
}

export function isCustomPricing(tier: PlanTier): boolean {
  return PLANS[tier].monthlyPriceCents === -1;
}

export function isInternalTier(tier: PlanTier): boolean {
  return tier === "internal";
}

/** Format monthly price for display. Returns "Free", "Custom", or "$X/mo" */
export function formatMonthlyPrice(tier: PlanTier): string {
  const plan = PLANS[tier];
  if (plan.monthlyPriceCents === 0) return "Free";
  if (plan.monthlyPriceCents === -1) return "Custom";
  return `$${(plan.monthlyPriceCents / 100).toFixed(0)}/mo`;
}

/** Format annual price for display. Returns "Free", "Custom", or "$X/yr" */
export function formatAnnualPrice(tier: PlanTier): string {
  const plan = PLANS[tier];
  if (plan.annualPriceCents === 0) return "Free";
  if (plan.annualPriceCents === -1) return "Custom";
  return `$${(plan.annualPriceCents / 100).toFixed(0)}/yr`;
}
