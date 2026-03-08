import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const planTierEnum = pgEnum("plan_tier", ["free", "operator", "pro", "enterprise"]);
export const billingIntervalEnum = pgEnum("billing_interval", ["monthly", "annual"]);

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tier: planTierEnum("tier").notNull().unique(),
  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdAnnual: text("stripe_price_id_annual"),

  // limits
  monthlyAgentExecutions: integer("monthly_agent_executions").notNull().default(100),
  monthlyApiCalls: integer("monthly_api_calls").notNull().default(1000),
  maxAgents: integer("max_agents").notNull().default(1),
  maxApiKeys: integer("max_api_keys").notNull().default(1),
  maxTeamMembers: integer("max_team_members").notNull().default(1),

  // features
  features: jsonb("features").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
