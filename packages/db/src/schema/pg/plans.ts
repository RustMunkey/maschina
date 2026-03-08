import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { planTierEnum } from "./enums.js";

export const plans = pgTable("plans", {
  id:   uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tier: planTierEnum("tier").notNull().unique(),

  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdAnnual:  text("stripe_price_id_annual"),

  // ── Usage limits ──────────────────────────────────────────────────────────
  monthlyAgentExecutions: integer("monthly_agent_executions").notNull().default(50),
  monthlyApiCalls:        integer("monthly_api_calls").notNull().default(500),
  monthlyModelTokens: integer("monthly_model_tokens").notNull().default(0),
  maxAgents:              integer("max_agents").notNull().default(1),
  maxApiKeys:             integer("max_api_keys").notNull().default(0),
  maxTeamMembers:         integer("max_team_members").notNull().default(1),
  maxConnectors:          integer("max_connectors").notNull().default(1),
  storageGb:              integer("storage_gb").notNull().default(1),

  // ── Feature flags per plan ────────────────────────────────────────────────
  features: jsonb("features").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tierIdx:    uniqueIndex("plans_tier_idx").on(t.tier),
  activeIdx:  index("plans_active_idx").on(t.isActive),
}));

export type Plan    = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
