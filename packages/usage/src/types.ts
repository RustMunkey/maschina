// ─── Usage event types ────────────────────────────────────────────────────────

export type UsageEventType =
  | "api_call"
  | "agent_execution"
  | "model_inference"
  | "storage_read"
  | "storage_write";

export interface RecordUsageInput {
  userId: string;
  type: UsageEventType;
  /** Total billable units. For model_inference this is inputTokens + outputTokens. */
  units: number;
  apiKeyId?: string;
  agentId?: string;
  model?: string;
  /** For model_inference: prompt token count from model response */
  inputTokens?: number;
  /** For model_inference: completion token count from model response */
  outputTokens?: number;
}

// ─── Quota check ──────────────────────────────────────────────────────────────

export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  limit: number;       // -1 = unlimited
  remaining: number;   // -1 = unlimited; 0 = at limit
  percentageUsed: number;
  /** "ok" | "warning" (≥80%) | "exceeded" (≥100%) */
  status: "ok" | "warning" | "exceeded";
  /** ISO timestamp of when the quota resets (first second of next month, UTC) */
  resetsAt: string;
}

// ─── Usage summary (for dashboard + billing) ──────────────────────────────────

export interface PeriodUsage {
  agentExecutions: number;
  apiCalls: number;
  modelTokens: number;
  storageReads: number;
  storageWrites: number;
}

export interface UsageSummary {
  userId: string;
  period: string;     // "2026-03"
  periodStart: Date;
  periodEnd: Date;
  usage: PeriodUsage;
  /** Source: "redis" (real-time) | "postgres" (checkpoint, may lag up to 24h) */
  source: "redis" | "postgres";
}

// ─── Rate limit headers (returned on every API response) ─────────────────────

export interface RateLimitHeaders {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;         // Unix timestamp
  "X-RateLimit-Used": string;
  "X-Quota-Type": string;
}
