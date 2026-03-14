import { pgEnum } from "drizzle-orm/pg-core";

// ─── User / Auth ──────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "member", "viewer"]);
export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "member", "viewer"]);

// ─── Plans / Billing ─────────────────────────────────────────────────────────
export const planTierEnum = pgEnum("plan_tier", [
  "access",
  "m1",
  "m5",
  "m10",
  "teams",
  "enterprise",
  "internal",
]);
export const billingIntervalEnum = pgEnum("billing_interval", ["monthly", "annual"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "trialing",
  "paused",
]);
export const creditTxTypeEnum = pgEnum("credit_tx_type", [
  "purchase",
  "usage",
  "refund",
  "bonus",
  "adjustment",
]);

// ─── Agents ───────────────────────────────────────────────────────────────────
export const agentTypeEnum = pgEnum("agent_type", [
  "signal",
  "analysis",
  "execution",
  "optimization",
  "reporting",
]);
export const agentStatusEnum = pgEnum("agent_status", [
  "idle",
  "scanning",
  "evaluating",
  "executing",
  "analyzing",
  "scaling",
  "error",
  "stopped",
]);

// ─── Usage ────────────────────────────────────────────────────────────────────
export const usageEventTypeEnum = pgEnum("usage_event_type", [
  "api_call",
  "agent_execution",
  "model_inference",
  "storage_read",
  "storage_write",
]);

// ─── Infrastructure ───────────────────────────────────────────────────────────
export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "canceled",
  "retrying",
]);
export const webhookStatusEnum = pgEnum("webhook_status", ["active", "disabled", "failing"]);
export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "success",
  "failed",
  "retrying",
]);
export const connectorStatusEnum = pgEnum("connector_status", [
  "active",
  "error",
  "disconnected",
  "pending",
]);
export const fileVisibilityEnum = pgEnum("file_visibility", ["private", "org", "public"]);
export const walletNetworkEnum = pgEnum("wallet_network", [
  "solana_mainnet",
  "solana_devnet",
  "solana_testnet",
]);

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationTypeEnum = pgEnum("notification_type", [
  "agent_run_completed",
  "agent_run_failed",
  "usage_quota_warning",
  "usage_quota_exceeded",
  "billing_payment_failed",
  "billing_invoice_ready",
  "team_invite_received",
  "team_member_joined",
  "system_announcement",
]);

// ─── Marketplace ─────────────────────────────────────────────────────────────
export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "pending_review",
  "active",
  "suspended",
  "archived",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "completed",
  "refunded",
  "disputed",
]);

// ─── Nodes / Compute Network ──────────────────────────────────────────────────
export const nodeStatusEnum = pgEnum("node_status", [
  "pending", // registered, awaiting first heartbeat / approval
  "active", // online and accepting work
  "suspended", // temporarily suspended (policy violation, poor performance)
  "offline", // heartbeat timeout — was active, now unreachable
  "banned", // permanently removed from the network
]);

// Tier determines verification level, task routing priority, and trust model:
// micro      — RPi, SBCs, watches (data relay, tiny quantized models only)
// edge       — Mac Minis, consumer desktops, GPU workstations
// standard   — mid-range servers, general compute (stake + reputation model)
// verified   — TEE-attested nodes (AMD SEV / Intel SGX) — premium routing
// datacenter — enterprise server farms, data centers, GPU clusters
export const nodeTierEnum = pgEnum("node_tier", [
  "micro",
  "edge",
  "standard",
  "verified",
  "datacenter",
]);

// ─── Compliance ───────────────────────────────────────────────────────────────
export const consentTypeEnum = pgEnum("consent_type", [
  "terms_of_service",
  "privacy_policy",
  "marketing",
  "data_processing",
]);
export const dataExportStatusEnum = pgEnum("data_export_status", [
  "pending",
  "processing",
  "ready",
  "expired",
]);
