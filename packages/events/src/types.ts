// ─── Maschina Event Types ─────────────────────────────────────────────────────
// All events that flow through NATS JetStream.
// Consumers in any service/language subscribe to these subjects.
//
// Subject convention:  maschina.<domain>.<entity>.<verb>
// Example:             maschina.agent.run.completed
//
// Every event has a shared envelope (id, timestamp, version) so consumers can
// process them idempotently and handle schema evolution gracefully.

// ─── Envelope ─────────────────────────────────────────────────────────────────

export interface EventEnvelope<T = unknown> {
  /** Globally unique event ID — used for idempotency checks */
  id: string;
  /** ISO 8601 UTC timestamp */
  timestamp: string;
  /** Schema version — increment when payload shape changes */
  version: number;
  /** Event subject (mirrors NATS subject) */
  subject: string;
  /** Event payload */
  data: T;
}

// ─── Agent events ─────────────────────────────────────────────────────────────

export interface AgentRunQueuedData {
  runId:   string;
  agentId: string;
  userId:  string;
  tier:    string;
}

export interface AgentRunStartedData {
  runId:   string;
  agentId: string;
  userId:  string;
}

export interface AgentRunCompletedData {
  runId:        string;
  agentId:      string;
  userId:       string;
  inputTokens:  number;
  outputTokens: number;
  durationMs:   number;
}

export interface AgentRunFailedData {
  runId:        string;
  agentId:      string;
  userId:       string;
  errorCode:    string;
  errorMessage: string;
}

export interface AgentRunTimedOutData {
  runId:       string;
  agentId:     string;
  userId:      string;
  timeoutSecs: number;
}

// ─── User events ──────────────────────────────────────────────────────────────

export interface UserRegisteredData {
  userId: string;
  email:  string;
}

export interface UserEmailVerifiedData {
  userId: string;
  email:  string;
}

export interface UserDeletedData {
  userId: string;
  email:  string;
}

// ─── Billing / Subscription events ───────────────────────────────────────────

export interface SubscriptionCreatedData {
  userId:         string;
  subscriptionId: string;
  tier:           string;
  interval:       "monthly" | "annual";
  periodEnd:      string;
}

export interface SubscriptionUpdatedData {
  userId:         string;
  subscriptionId: string;
  oldTier:        string;
  newTier:        string;
  interval:       "monthly" | "annual";
  periodEnd:      string;
}

export interface SubscriptionCanceledData {
  userId:         string;
  subscriptionId: string;
  tier:           string;
  cancelAt:       string;
}

export interface PaymentFailedData {
  userId:   string;
  invoiceId: string;
  amountCents: number;
  reason:   string;
}

export interface CreditPurchasedData {
  userId:      string;
  amountCents: number;
  newBalanceCents: number;
}

// ─── Usage / Quota events ─────────────────────────────────────────────────────

export interface QuotaWarningData {
  userId:          string;
  quotaType:       string;
  used:            number;
  limit:           number;
  percentageUsed:  number;
  resetsAt:        string;
}

export interface QuotaExceededData {
  userId:    string;
  quotaType: string;
  used:      number;
  limit:     number;
  resetsAt:  string;
}

// ─── Notification events ──────────────────────────────────────────────────────

export interface NotificationRequestedData {
  userId:   string;
  type:     string;
  channels: Array<"email" | "in_app" | "push">;
  payload:  Record<string, unknown>;
}

// ─── System events ────────────────────────────────────────────────────────────

export interface SystemAnnouncementData {
  title:    string;
  body:     string;
  severity: "info" | "warning" | "critical";
  targetTiers?: string[];  // null = all tiers
}

// ─── Subject registry ─────────────────────────────────────────────────────────
// Single source of truth for NATS subject strings.
// Use these constants everywhere — never hardcode subject strings.

export const Subjects = {
  // Agent
  AgentRunQueued:    "maschina.agent.run.queued",
  AgentRunStarted:   "maschina.agent.run.started",
  AgentRunCompleted: "maschina.agent.run.completed",
  AgentRunFailed:    "maschina.agent.run.failed",
  AgentRunTimedOut:  "maschina.agent.run.timed_out",

  // User
  UserRegistered:    "maschina.user.registered",
  UserEmailVerified: "maschina.user.email.verified",
  UserDeleted:       "maschina.user.deleted",

  // Billing
  SubscriptionCreated:  "maschina.billing.subscription.created",
  SubscriptionUpdated:  "maschina.billing.subscription.updated",
  SubscriptionCanceled: "maschina.billing.subscription.canceled",
  PaymentFailed:        "maschina.billing.payment.failed",
  CreditPurchased:      "maschina.billing.credit.purchased",

  // Usage
  QuotaWarning:  "maschina.usage.quota.warning",
  QuotaExceeded: "maschina.usage.quota.exceeded",

  // Notifications
  NotificationRequested: "maschina.notification.requested",

  // System
  SystemAnnouncement: "maschina.system.announcement",
} as const;

export type Subject = typeof Subjects[keyof typeof Subjects];

// ─── Typed event map ──────────────────────────────────────────────────────────
// Maps each subject to its payload type for end-to-end type safety.

export interface EventMap {
  [Subjects.AgentRunQueued]:    AgentRunQueuedData;
  [Subjects.AgentRunStarted]:   AgentRunStartedData;
  [Subjects.AgentRunCompleted]: AgentRunCompletedData;
  [Subjects.AgentRunFailed]:    AgentRunFailedData;
  [Subjects.AgentRunTimedOut]:  AgentRunTimedOutData;

  [Subjects.UserRegistered]:    UserRegisteredData;
  [Subjects.UserEmailVerified]: UserEmailVerifiedData;
  [Subjects.UserDeleted]:       UserDeletedData;

  [Subjects.SubscriptionCreated]:  SubscriptionCreatedData;
  [Subjects.SubscriptionUpdated]:  SubscriptionUpdatedData;
  [Subjects.SubscriptionCanceled]: SubscriptionCanceledData;
  [Subjects.PaymentFailed]:        PaymentFailedData;
  [Subjects.CreditPurchased]:      CreditPurchasedData;

  [Subjects.QuotaWarning]:  QuotaWarningData;
  [Subjects.QuotaExceeded]: QuotaExceededData;

  [Subjects.NotificationRequested]: NotificationRequestedData;
  [Subjects.SystemAnnouncement]:    SystemAnnouncementData;
}
