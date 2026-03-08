export type PlanTier = "access" | "m1" | "m5" | "m10" | "teams" | "enterprise" | "internal";

/** Volume discount seat bracket for the Mach Team tier. */
export interface SeatBracket {
  /** Minimum seat count (inclusive). */
  minSeats: number;
  /** Maximum seat count (inclusive). null = open-ended → Enterprise redirect. */
  maxSeats: number | null;
  /** Price per seat per month in cents when billed monthly. null = Enterprise. */
  monthlyPerSeatCents: number | null;
  /** Price per seat per month in cents (effective) when billed annually. null = Enterprise. */
  annualPerSeatMonthlyRateCents: number | null;
  /** Total price per seat for the year in cents. null = Enterprise. */
  annualPerSeatTotalCents: number | null;
}

export interface PlanLimits {
  /** Monthly agent task executions included. -1 = unlimited. */
  monthlyAgentExecutions: number;
  /** Monthly REST/SDK API calls included. -1 = unlimited. */
  monthlyApiCalls: number;
  /** Monthly model tokens (input + output) included. 0 = model not available. -1 = unlimited. */
  monthlyModelTokens: number;
  /** Max concurrent agent definitions. -1 = unlimited. */
  maxAgents: number;
  /** Max API keys. -1 = unlimited. */
  maxApiKeys: number;
  /** Max team seats. -1 = unlimited. */
  maxTeamMembers: number;
  /** Max connected integrations. -1 = unlimited. */
  maxConnectors: number;
  /** Storage quota in GB. -1 = unlimited. */
  storageGb: number;
}

export interface PlanFeatures {
  localExecution: boolean;
  cloudExecution: boolean;
  maschinaModel: boolean;
  marketplace: boolean;
  analytics: boolean;
  compliance: boolean;
  prioritySupport: boolean;
  customConnectors: boolean;
  webhooks: boolean;
  sla: boolean;
  onPrem: boolean;
  dedicatedInfra: boolean;
  /** Role-based access control (owner / admin / member roles). */
  rbac: boolean;
  /** Shared agent pool — agents visible and runnable by all team members. */
  sharedAgentPool: boolean;
  /** Workflow automation — chained / scheduled multi-agent runs. */
  workflowAutomation: boolean;
  /** Team dashboard — aggregate usage, member activity, billing overview. */
  teamDashboard: boolean;
}

export interface PlanConfig extends PlanLimits {
  tier: PlanTier;
  /** Short display name shown in UI e.g. "Mach-1" */
  name: string;
  /** Full display name e.g. "Maschina Mach-1" */
  fullName: string;
  /** Abbreviation shown on badges e.g. "M1" */
  badge: string;
  /** Monthly price in cents when billed monthly. 0 = free. -1 = custom. */
  monthlyPriceCents: number;
  /** Total price in cents when billed annually (full year charge). -1 = custom. */
  annualPriceCents: number;
  /** Effective monthly rate when billed annually, in cents. -1 = custom. */
  annualMonthlyRateCents: number;
  /**
   * True for seat-based tiers (Mach Team). Prices above are per-seat.
   * Use getTeamSeatPrice() for volume-adjusted pricing.
   */
  perSeat: boolean;
  features: PlanFeatures;
}

export type QuotaKey =
  | "agentExecutions"
  | "apiCalls"
  | "modelTokens"
  | "storageGb"
  | "agents"
  | "apiKeys"
  | "teamMembers"
  | "connectors";

export interface QuotaStatus {
  key: QuotaKey;
  used: number;
  limit: number;
  unlimited: boolean;
  percentage: number;
  exceeded: boolean;
}
