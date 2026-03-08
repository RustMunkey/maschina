import { getPlan } from "./definitions.js";
import type { PlanTier, QuotaKey, QuotaStatus } from "./types.js";

// ─── Quota resolution ─────────────────────────────────────────────────────────

function resolveLimit(tier: PlanTier, key: QuotaKey): number {
  const plan = getPlan(tier);
  switch (key) {
    case "agentExecutions":
      return plan.monthlyAgentExecutions;
    case "apiCalls":
      return plan.monthlyApiCalls;
    case "modelTokens":
      return plan.monthlyModelTokens;
    case "storageGb":
      return plan.storageGb;
    case "agents":
      return plan.maxAgents;
    case "apiKeys":
      return plan.maxApiKeys;
    case "teamMembers":
      return plan.maxTeamMembers;
    case "connectors":
      return plan.maxConnectors;
  }
}

export function getQuotaStatus(tier: PlanTier, key: QuotaKey, used: number): QuotaStatus {
  const limit = resolveLimit(tier, key);
  const unlimited = limit === -1;
  const percentage = unlimited ? 0 : Math.round((used / limit) * 100);
  return {
    key,
    used,
    limit,
    unlimited,
    percentage,
    exceeded: !unlimited && used >= limit,
  };
}

// Check a single limit — returns true if the action is allowed
export function withinQuota(tier: PlanTier, key: QuotaKey, currentUsage: number): boolean {
  return getQuotaStatus(tier, key, currentUsage).exceeded === false;
}

// Check before consuming a resource (e.g. before starting an agent run)
export function canConsumeQuota(
  tier: PlanTier,
  key: QuotaKey,
  currentUsage: number,
  amount = 1,
): boolean {
  const limit = resolveLimit(tier, key);
  if (limit === -1) return true;
  return currentUsage + amount <= limit;
}

// Batch check — returns a map of quota status for all keys
export function getAllQuotas(
  tier: PlanTier,
  usage: Partial<Record<QuotaKey, number>>,
): Record<QuotaKey, QuotaStatus> {
  const keys: QuotaKey[] = [
    "agentExecutions",
    "apiCalls",
    "modelTokens",
    "storageGb",
    "agents",
    "apiKeys",
    "teamMembers",
    "connectors",
  ];

  return Object.fromEntries(
    keys.map((key) => [key, getQuotaStatus(tier, key, usage[key] ?? 0)]),
  ) as Record<QuotaKey, QuotaStatus>;
}

// ─── Readable quota labels (for UI) ───────────────────────────────────────────

export const QUOTA_LABELS: Record<QuotaKey, string> = {
  agentExecutions: "Agent executions",
  apiCalls: "API calls",
  modelTokens: "Model tokens",
  storageGb: "Storage",
  agents: "Agents",
  apiKeys: "API keys",
  teamMembers: "Team members",
  connectors: "Connectors",
};

export function formatLimit(limit: number, key: QuotaKey): string {
  if (limit === -1) return "Unlimited";
  if (limit === 0) return "Not available";
  if (key === "storageGb") return `${limit} GB`;
  if (key === "modelTokens") {
    if (limit >= 1_000_000) return `${limit / 1_000_000}M tokens`;
    if (limit >= 1_000) return `${limit / 1_000}K tokens`;
    return `${limit} tokens`;
  }
  return limit.toLocaleString();
}
