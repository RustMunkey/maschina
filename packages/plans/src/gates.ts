import { getPlan } from "./definitions.js";
import type { PlanFeatures, PlanTier } from "./types.js";

const TIER_RANK: Record<PlanTier, number> = {
  access:     0,
  m1:         1,
  m5:         2,
  m10:        3,
  teams:      4,
  enterprise: 5,
  internal:   5,  // same rank as enterprise — full access, never publicly visible
};

export function hasFeature(tier: PlanTier, feature: keyof PlanFeatures): boolean {
  return getPlan(tier).features[feature];
}

export function isAtLeastTier(userTier: PlanTier, required: PlanTier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required];
}

export function nextTier(tier: PlanTier): PlanTier | null {
  const progression: PlanTier[] = ["access", "m1", "m5", "m10", "teams", "enterprise"];
  const idx = progression.indexOf(tier);
  if (idx === -1 || idx === progression.length - 1) return null;
  return progression[idx + 1] ?? null;
}

export const can = {
  useCloudExecution:    (t: PlanTier) => hasFeature(t, "cloudExecution"),
  useMaschinaModel:     (t: PlanTier) => hasFeature(t, "maschinaModel"),
  useMarketplace:       (t: PlanTier) => hasFeature(t, "marketplace"),
  useAnalytics:         (t: PlanTier) => hasFeature(t, "analytics"),
  useCompliance:        (t: PlanTier) => hasFeature(t, "compliance"),
  useWebhooks:          (t: PlanTier) => hasFeature(t, "webhooks"),
  useCustomConnectors:  (t: PlanTier) => hasFeature(t, "customConnectors"),
  useApiKeys:           (t: PlanTier) => isAtLeastTier(t, "m1"),
  inviteTeamMembers:    (t: PlanTier) => isAtLeastTier(t, "teams"),
  hasPrioritySupport:   (t: PlanTier) => hasFeature(t, "prioritySupport"),
  hasSla:               (t: PlanTier) => hasFeature(t, "sla"),
  useOnPrem:            (t: PlanTier) => hasFeature(t, "onPrem"),
  useDedicatedInfra:    (t: PlanTier) => hasFeature(t, "dedicatedInfra"),
  // ─── Mach Team features ───────────────────────────────────────────────────
  useRbac:              (t: PlanTier) => hasFeature(t, "rbac"),
  useSharedAgentPool:   (t: PlanTier) => hasFeature(t, "sharedAgentPool"),
  useWorkflowAutomation:(t: PlanTier) => hasFeature(t, "workflowAutomation"),
  useTeamDashboard:     (t: PlanTier) => hasFeature(t, "teamDashboard"),
  // ─── Billing bypass ───────────────────────────────────────────────────────
  skipBilling:          (t: PlanTier) => t === "internal",  // no quota checks, no Stripe
};

export interface UpgradeHint {
  feature: string;
  requiredTier: PlanTier;
  description: string;
}

export function getUpgradeHints(currentTier: PlanTier): UpgradeHint[] {
  const hints: UpgradeHint[] = [];
  if (!can.useCloudExecution(currentTier))
    hints.push({ feature: "cloudExecution",  requiredTier: "m1",  description: "Run agents on Maschina cloud infrastructure" });
  if (!can.useMaschinaModel(currentTier))
    hints.push({ feature: "maschinaModel",   requiredTier: "m1",  description: "Access the Maschina model" });
  if (!can.useApiKeys(currentTier))
    hints.push({ feature: "apiKeys",         requiredTier: "m1",  description: "Create API keys for programmatic access" });
  if (!can.useAnalytics(currentTier))
    hints.push({ feature: "analytics",       requiredTier: "m5",  description: "Usage dashboards and analytics" });
  if (!can.useCustomConnectors(currentTier))
    hints.push({ feature: "customConnectors",requiredTier: "m5",  description: "Build and publish custom connectors" });
  if (!can.useCompliance(currentTier))
    hints.push({ feature: "compliance",      requiredTier: "m10", description: "SOC 2 / GDPR compliance tools and audit trails" });
  if (!can.hasPrioritySupport(currentTier))
    hints.push({ feature: "prioritySupport", requiredTier: "m10", description: "Priority support queue" });
  if (!can.inviteTeamMembers(currentTier))
    hints.push({ feature: "teamMembers",       requiredTier: "teams", description: "Invite team members with role-based access" });
  if (!can.useSharedAgentPool(currentTier))
    hints.push({ feature: "sharedAgentPool",   requiredTier: "teams", description: "Share agents across your entire team" });
  if (!can.useWorkflowAutomation(currentTier))
    hints.push({ feature: "workflowAutomation",requiredTier: "teams", description: "Chain and schedule multi-agent workflows" });
  if (!can.useTeamDashboard(currentTier))
    hints.push({ feature: "teamDashboard",     requiredTier: "teams", description: "Team-wide usage analytics and billing overview" });
  return hints;
}
