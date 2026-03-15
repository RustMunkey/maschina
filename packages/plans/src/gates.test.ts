import { describe, expect, it } from "vitest";
import { can, hasFeature, isAtLeastTier, nextTier } from "./gates.js";
import type { PlanTier } from "./types.js";

// ─── isAtLeastTier ────────────────────────────────────────────────────────────

describe("isAtLeastTier", () => {
  it("access < m1", () => expect(isAtLeastTier("access", "m1")).toBe(false));
  it("m1 >= m1", () => expect(isAtLeastTier("m1", "m1")).toBe(true));
  it("m5 >= m1", () => expect(isAtLeastTier("m5", "m1")).toBe(true));
  it("internal >= enterprise", () => expect(isAtLeastTier("internal", "enterprise")).toBe(true));
  it("access is not >= access+1 tiers", () => {
    const paid: PlanTier[] = ["m1", "m5", "m10", "teams", "enterprise"];
    for (const tier of paid) {
      expect(isAtLeastTier("access", tier)).toBe(false);
    }
  });
});

// ─── nextTier ─────────────────────────────────────────────────────────────────

describe("nextTier", () => {
  it("access → m1", () => expect(nextTier("access")).toBe("m1"));
  it("m1 → m5", () => expect(nextTier("m1")).toBe("m5"));
  it("m5 → m10", () => expect(nextTier("m5")).toBe("m10"));
  it("m10 → teams", () => expect(nextTier("m10")).toBe("teams"));
  it("teams → enterprise", () => expect(nextTier("teams")).toBe("enterprise"));
  it("enterprise → null (top of progression)", () => expect(nextTier("enterprise")).toBeNull());
  it("internal → null (not in progression)", () => expect(nextTier("internal")).toBeNull());
});

// ─── can.skipBilling ──────────────────────────────────────────────────────────

describe("can.skipBilling", () => {
  it("internal bypasses billing", () => expect(can.skipBilling("internal")).toBe(true));
  it("enterprise does NOT bypass billing", () => expect(can.skipBilling("enterprise")).toBe(false));
  it("m10 does NOT bypass billing", () => expect(can.skipBilling("m10")).toBe(false));
  it("access does NOT bypass billing", () => expect(can.skipBilling("access")).toBe(false));
});

// ─── can.useApiKeys ───────────────────────────────────────────────────────────

describe("can.useApiKeys", () => {
  it("access cannot use API keys", () => expect(can.useApiKeys("access")).toBe(false));
  it("m1 can use API keys", () => expect(can.useApiKeys("m1")).toBe(true));
  it("m5 can use API keys", () => expect(can.useApiKeys("m5")).toBe(true));
  it("internal can use API keys", () => expect(can.useApiKeys("internal")).toBe(true));
});

// ─── can.useCompliance ────────────────────────────────────────────────────────

describe("can.useCompliance", () => {
  it("access cannot use compliance", () => expect(can.useCompliance("access")).toBe(false));
  it("m1 cannot use compliance", () => expect(can.useCompliance("m1")).toBe(false));
  it("m5 cannot use compliance", () => expect(can.useCompliance("m5")).toBe(false));
  it("m10 can use compliance", () => expect(can.useCompliance("m10")).toBe(true));
  it("enterprise can use compliance", () => expect(can.useCompliance("enterprise")).toBe(true));
  it("internal can use compliance", () => expect(can.useCompliance("internal")).toBe(true));
});

// ─── can.inviteTeamMembers ────────────────────────────────────────────────────

describe("can.inviteTeamMembers", () => {
  it("access cannot invite", () => expect(can.inviteTeamMembers("access")).toBe(false));
  it("m10 cannot invite", () => expect(can.inviteTeamMembers("m10")).toBe(false));
  it("teams can invite", () => expect(can.inviteTeamMembers("teams")).toBe(true));
  it("enterprise can invite", () => expect(can.inviteTeamMembers("enterprise")).toBe(true));
  it("internal can invite", () => expect(can.inviteTeamMembers("internal")).toBe(true));
});

// ─── can.useWebhooks ──────────────────────────────────────────────────────────

describe("can.useWebhooks", () => {
  it("access cannot use webhooks", () => expect(can.useWebhooks("access")).toBe(false));

  // Webhooks are gated behind at least m1 or above — verify exact gate
  const tiers: PlanTier[] = ["m1", "m5", "m10", "teams", "enterprise", "internal"];
  for (const tier of tiers) {
    it(`${tier} can use webhooks`, () => expect(can.useWebhooks(tier)).toBe(true));
  }
});

// ─── hasFeature (generic gate) ────────────────────────────────────────────────

describe("hasFeature", () => {
  it("internal has every feature", () => {
    const features = [
      "cloudExecution",
      "maschinaModel",
      "marketplace",
      "analytics",
      "compliance",
      "webhooks",
      "customConnectors",
      "prioritySupport",
      "sla",
      "onPrem",
      "dedicatedInfra",
      "rbac",
      "sharedAgentPool",
      "workflowAutomation",
      "teamDashboard",
    ] as const;
    for (const f of features) {
      expect(hasFeature("internal", f)).toBe(true);
    }
  });

  it("access tier has no premium features", () => {
    expect(hasFeature("access", "cloudExecution")).toBe(false);
    expect(hasFeature("access", "analytics")).toBe(false);
    expect(hasFeature("access", "compliance")).toBe(false);
  });
});
