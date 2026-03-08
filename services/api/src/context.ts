import type { Context } from "hono";
import type { PlanTier } from "@maschina/plans";
import type { QuotaCheckResult } from "@maschina/usage";

// ─── Per-request context variables ───────────────────────────────────────────
// Set by auth middleware, readable in all downstream handlers via c.var.*

export interface RequestUser {
  id: string;
  email: string;
  role: string;
  tier: PlanTier;
  sessionId?: string;   // set for JWT auth
  apiKeyId?: string;    // set for API key auth
}

export type Variables = {
  user:  RequestUser;
  quota: QuotaCheckResult | null;
};

export type AppContext = Context<{ Variables: Variables }>;
