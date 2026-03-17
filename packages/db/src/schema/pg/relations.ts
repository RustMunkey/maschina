import { relations } from "drizzle-orm";
import { agentPermissions, agentRuns, agents } from "./agents.js";
import { alerts } from "./alerts.js";
import { apiKeys } from "./api_keys.js";
import { oauthAccounts, sessions, verificationTokens } from "./auth.js";
import { billingEvents } from "./billing_events.js";
import { connectors } from "./connectors.js";
import { creditBalances, creditTransactions } from "./credits.js";
import { jobs } from "./jobs.js";
import {
  featureFlagOverrides,
  featureFlags,
  files,
  reputationScores,
  walletAddresses,
} from "./misc.js";
import { nodeCapabilities, nodeHeartbeats, nodes } from "./nodes.js";
import { notifications } from "./notifications.js";
import { organizationInvites, organizationMembers, organizations } from "./organizations.js";
import { plans } from "./plans.js";
import { pushTokens } from "./push_tokens.js";
import { executionReceipts } from "./receipts.js";
import { subscriptions as subs } from "./subscriptions.js";
import { usageEvents, usageRollups } from "./usage.js";
import { userPasswords, users } from "./users.js";
import { webhookDeliveries, webhooks } from "./webhooks.js";

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  password: one(userPasswords, { fields: [users.id], references: [userPasswords.userId] }),
  sessions: many(sessions),
  oauthAccounts: many(oauthAccounts),
  subscription: one(subs, { fields: [users.id], references: [subs.userId] }),
  apiKeys: many(apiKeys),
  agents: many(agents),
  agentRuns: many(agentRuns),
  usageEvents: many(usageEvents),
  usageRollups: many(usageRollups),
  creditBalances: many(creditBalances),
  jobs: many(jobs),
  webhooks: many(webhooks),
  notifications: many(notifications),
  alerts: many(alerts),
  pushTokens: many(pushTokens),
  connectors: many(connectors),
  wallets: many(walletAddresses),
  files: many(files),
  reputation: many(reputationScores),
  nodes: many(nodes),
}));

export const userPasswordsRelations = relations(userPasswords, ({ one }) => ({
  user: one(users, { fields: [userPasswords.userId], references: [users.id] }),
}));

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, { fields: [oauthAccounts.userId], references: [users.id] }),
}));

export const verificationTokensRelations = relations(verificationTokens, ({ one }) => ({
  user: one(users, { fields: [verificationTokens.userId], references: [users.id] }),
}));

// ─── Plans / Subscriptions ────────────────────────────────────────────────────

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subs),
}));

export const subscriptionsRelations = relations(subs, ({ one }) => ({
  user: one(users, { fields: [subs.userId], references: [users.id] }),
  plan: one(plans, { fields: [subs.planId], references: [plans.id] }),
}));

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
  usageEvents: many(usageEvents),
}));

// ─── Agents ───────────────────────────────────────────────────────────────────

export const agentsRelations = relations(agents, ({ one, many }) => ({
  user: one(users, { fields: [agents.userId], references: [users.id] }),
  runs: many(agentRuns),
  permissions: many(agentPermissions),
}));

export const agentPermissionsRelations = relations(agentPermissions, ({ one }) => ({
  agent: one(agents, { fields: [agentPermissions.agentId], references: [agents.id] }),
  grantedBy: one(users, { fields: [agentPermissions.grantedByUserId], references: [users.id] }),
}));

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  agent: one(agents, { fields: [agentRuns.agentId], references: [agents.id] }),
  user: one(users, { fields: [agentRuns.userId], references: [users.id] }),
  receipt: many(executionReceipts),
}));

// ─── Execution Receipts ───────────────────────────────────────────────────────

export const executionReceiptsRelations = relations(executionReceipts, ({ one }) => ({
  run: one(agentRuns, { fields: [executionReceipts.runId], references: [agentRuns.id] }),
  agent: one(agents, { fields: [executionReceipts.agentId], references: [agents.id] }),
  user: one(users, { fields: [executionReceipts.userId], references: [users.id] }),
}));

// ─── Usage ────────────────────────────────────────────────────────────────────

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  user: one(users, { fields: [usageEvents.userId], references: [users.id] }),
  apiKey: one(apiKeys, { fields: [usageEvents.apiKeyId], references: [apiKeys.id] }),
}));

export const usageRollupsRelations = relations(usageRollups, ({ one }) => ({
  user: one(users, { fields: [usageRollups.userId], references: [users.id] }),
}));

// ─── Credits ──────────────────────────────────────────────────────────────────

export const creditBalancesRelations = relations(creditBalances, ({ one }) => ({
  user: one(users, { fields: [creditBalances.userId], references: [users.id] }),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(users, { fields: [creditTransactions.userId], references: [users.id] }),
}));

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export const jobsRelations = relations(jobs, ({ one }) => ({
  user: one(users, { fields: [jobs.userId], references: [users.id] }),
}));

// ─── Billing Events ───────────────────────────────────────────────────────────

// billingEvents has no userId — Stripe events are not user-scoped

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  user: one(users, { fields: [webhooks.userId], references: [users.id] }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  webhook: one(webhooks, { fields: [webhookDeliveries.webhookId], references: [webhooks.id] }),
}));

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// ─── Connectors ───────────────────────────────────────────────────────────────

export const connectorsRelations = relations(connectors, ({ one }) => ({
  user: one(users, { fields: [connectors.userId], references: [users.id] }),
}));

// ─── Misc ─────────────────────────────────────────────────────────────────────

export const walletAddressesRelations = relations(walletAddresses, ({ one }) => ({
  user: one(users, { fields: [walletAddresses.userId], references: [users.id] }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  user: one(users, { fields: [files.userId], references: [users.id] }),
}));

export const featureFlagOverridesRelations = relations(featureFlagOverrides, ({ one }) => ({
  flag: one(featureFlags, { fields: [featureFlagOverrides.flagId], references: [featureFlags.id] }),
}));

export const reputationScoresRelations = relations(reputationScores, ({ one }) => ({
  user: one(users, { fields: [reputationScores.userId], references: [users.id] }),
}));

// ─── Organizations ────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  invites: many(organizationInvites),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  org: one(organizations, { fields: [organizationMembers.orgId], references: [organizations.id] }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
  invitedBy: one(users, {
    fields: [organizationMembers.invitedByUserId],
    references: [users.id],
    relationName: "invitedByUser",
  }),
}));

export const organizationInvitesRelations = relations(organizationInvites, ({ one }) => ({
  org: one(organizations, {
    fields: [organizationInvites.orgId],
    references: [organizations.id],
  }),
  invitedBy: one(users, {
    fields: [organizationInvites.invitedByUserId],
    references: [users.id],
  }),
}));

// ─── Nodes ────────────────────────────────────────────────────────────────────

export const nodesRelations = relations(nodes, ({ one, many }) => ({
  user: one(users, { fields: [nodes.userId], references: [users.id] }),
  capabilities: one(nodeCapabilities, {
    fields: [nodes.id],
    references: [nodeCapabilities.nodeId],
  }),
  heartbeats: many(nodeHeartbeats),
}));

export const nodeCapabilitiesRelations = relations(nodeCapabilities, ({ one }) => ({
  node: one(nodes, { fields: [nodeCapabilities.nodeId], references: [nodes.id] }),
}));

export const nodeHeartbeatsRelations = relations(nodeHeartbeats, ({ one }) => ({
  node: one(nodes, { fields: [nodeHeartbeats.nodeId], references: [nodes.id] }),
}));
