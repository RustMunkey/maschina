import { db } from "../client.js";
import { plans } from "../schema/pg/index.js";
import type { NewPlan } from "../schema/pg/index.js";

// planData is passed in from outside to avoid a circular dep with @maschina/plans.
// Callers should import { PLANS, PLAN_TIERS } from "@maschina/plans" and map to NewPlan[].
export async function seedPlans(planData: NewPlan[]) {
  console.log("Seeding plans...");
  for (const plan of planData) {
    await db
      .insert(plans)
      .values(plan)
      .onConflictDoUpdate({
        target: plans.tier,
        set: {
          name: plan.name,
          monthlyAgentExecutions: plan.monthlyAgentExecutions,
          monthlyApiCalls: plan.monthlyApiCalls,
          monthlyModelTokens: plan.monthlyModelTokens,
          maxAgents: plan.maxAgents,
          maxApiKeys: plan.maxApiKeys,
          maxTeamMembers: plan.maxTeamMembers,
          maxConnectors: plan.maxConnectors,
          storageGb: plan.storageGb,
          features: plan.features,
          updatedAt: new Date(),
        },
      });
  }
  console.log("Plans seeded.");
}
