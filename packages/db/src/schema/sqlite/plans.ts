import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const plans = sqliteTable("plans", {
  id:   text("id").primaryKey(),
  name: text("name").notNull(),
  tier: text("tier", { enum: ["access", "m1", "m5", "m10", "teams", "enterprise", "internal"] }).notNull().unique(),

  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdAnnual:  text("stripe_price_id_annual"),

  monthlyAgentExecutions: integer("monthly_agent_executions").notNull().default(50),
  monthlyApiCalls:        integer("monthly_api_calls").notNull().default(500),
  monthlyModelInferences: integer("monthly_model_inferences").notNull().default(0),
  maxAgents:              integer("max_agents").notNull().default(1),
  maxApiKeys:             integer("max_api_keys").notNull().default(0),
  maxTeamMembers:         integer("max_team_members").notNull().default(1),
  maxConnectors:          integer("max_connectors").notNull().default(1),
  storageGb:              integer("storage_gb").notNull().default(1),

  features:  text("features", { mode: "json" }).notNull().default("{}"),
  isActive:  integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type Plan = typeof plans.$inferSelect;
