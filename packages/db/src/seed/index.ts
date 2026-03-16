import { PLANS } from "@maschina/plans";
import type { NewPlan } from "../schema/pg/index.js";
import { seedPlans } from "./plans.js";

async function main() {
  console.log("Running database seed...");

  const planData: NewPlan[] = Object.values(PLANS).map((p) => ({
    name: p.name,
    tier: p.tier as NewPlan["tier"],
    monthlyAgentExecutions: p.monthlyAgentExecutions,
    monthlyApiCalls: p.monthlyApiCalls,
    monthlyModelTokens: p.monthlyModelTokens,
    maxAgents: p.maxAgents,
    maxApiKeys: p.maxApiKeys,
    maxTeamMembers: p.maxTeamMembers ?? 1,
    maxConnectors: p.maxConnectors,
    storageGb: p.storageGb,
    features: p.features as Record<string, unknown>,
  }));

  await seedPlans(planData);
  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
