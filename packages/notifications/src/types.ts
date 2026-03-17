export type NotificationChannel = "email" | "in_app" | "push" | "alert";

export type NotificationType =
  | "agent_run_completed"
  | "agent_run_failed"
  | "usage_quota_warning"
  | "usage_quota_exceeded"
  | "billing_payment_failed"
  | "billing_invoice_ready"
  | "team_invite_received"
  | "team_member_joined"
  | "system_announcement";

export interface NotificationPayload {
  type: NotificationType;
  userId: string;
  channels: NotificationChannel[];
  data: Record<string, unknown>;
}

// Per-type payload shapes — used by email templates and in-app rendering

export interface AgentRunCompletedPayload {
  runId: string;
  agentId: string;
  agentName: string;
  durationMs: number;
}

export interface AgentRunFailedPayload {
  runId: string;
  agentId: string;
  agentName: string;
  errorCode: string;
}

export interface QuotaWarningPayload {
  quotaType: string;
  percentageUsed: number;
  resetsAt: string;
}

export interface QuotaExceededPayload {
  quotaType: string;
  resetsAt: string;
  upgradeUrl: string;
}

export interface PaymentFailedPayload {
  invoiceId: string;
  amountCents: number;
  retryDate: string;
  portalUrl: string;
}

export interface TeamInvitePayload {
  inviterName: string;
  orgName: string;
  inviteUrl: string;
  expiresAt: string;
}
