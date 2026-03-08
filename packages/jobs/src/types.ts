// ─── Job types ────────────────────────────────────────────────────────────────
// Jobs are published to the MASCHINA_JOBS JetStream stream.
// The daemon pulls from this stream instead of polling PostgreSQL.
//
// Subject convention:  maschina.jobs.<queue>.<type>
// Queues:  agent | email | billing | analytics | maintenance

export type JobQueue = "agent" | "email" | "billing" | "analytics" | "maintenance";

// ─── Agent jobs ───────────────────────────────────────────────────────────────

export interface AgentExecuteJob {
  type: "agent.execute";
  runId: string;
  agentId: string;
  userId: string;
  tier: string;
  model: string;
  systemPrompt: string;
  inputPayload: unknown;
  timeoutSecs: number;
}

// ─── Email jobs ───────────────────────────────────────────────────────────────

export interface EmailVerificationJob {
  type: "email.verification";
  userId: string;
  email: string;
  token: string;
}

export interface EmailPasswordResetJob {
  type: "email.password_reset";
  userId: string;
  email: string;
  token: string;
}

export interface EmailBillingReceiptJob {
  type: "email.billing_receipt";
  userId: string;
  email: string;
  invoiceId: string;
  amountCents: number;
  periodEnd: string;
}

export interface EmailAgentCompletedJob {
  type: "email.agent_completed";
  userId: string;
  email: string;
  runId: string;
  agentId: string;
  agentName: string;
}

export interface EmailPaymentFailedJob {
  type: "email.payment_failed";
  userId: string;
  email: string;
  invoiceId: string;
  amountCents: number;
}

// ─── Billing jobs ─────────────────────────────────────────────────────────────

export interface BillingReconcileJob {
  type: "billing.reconcile";
  userId: string;
  period: string;
}

export interface BillingUsageReportJob {
  type: "billing.usage_report";
  period: string;
}

// ─── Analytics jobs ───────────────────────────────────────────────────────────

export interface AnalyticsFlushJob {
  type: "analytics.flush";
  userId: string;
  period: string;
}

// ─── Maintenance jobs ─────────────────────────────────────────────────────────

export interface MaintenancePruneSessionsJob {
  type: "maintenance.prune_sessions";
}

export interface MaintenancePruneTokensJob {
  type: "maintenance.prune_tokens";
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type AgentJob = AgentExecuteJob;

export type EmailJob =
  | EmailVerificationJob
  | EmailPasswordResetJob
  | EmailBillingReceiptJob
  | EmailAgentCompletedJob
  | EmailPaymentFailedJob;

export type BillingJob = BillingReconcileJob | BillingUsageReportJob;

export type AnalyticsJob = AnalyticsFlushJob;

export type MaintenanceJob = MaintenancePruneSessionsJob | MaintenancePruneTokensJob;

export type Job = AgentJob | EmailJob | BillingJob | AnalyticsJob | MaintenanceJob;

// ─── Subject helpers ──────────────────────────────────────────────────────────

export function jobSubject(job: Job): string {
  const queue = job.type.split(".")[0];
  return `maschina.jobs.${queue}.${job.type}`;
}
