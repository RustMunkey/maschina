// Typed event payloads for outbound webhooks.
// These map directly to the event strings stored in webhooks.events[].

export const WEBHOOK_EVENTS = [
  "agent.run.started",
  "agent.run.completed",
  "agent.run.failed",
  "subscription.updated",
  "usage.quota_warning",
  "usage.quota_exceeded",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookEventBase {
  id: string; // unique delivery ID (uuid)
  type: WebhookEventType;
  created_at: string; // ISO timestamp
  api_version: string; // "2026-03-13"
}

export interface AgentRunStartedPayload extends WebhookEventBase {
  type: "agent.run.started";
  data: {
    run_id: string;
    agent_id: string;
    user_id: string;
    model: string;
  };
}

export interface AgentRunCompletedPayload extends WebhookEventBase {
  type: "agent.run.completed";
  data: {
    run_id: string;
    agent_id: string;
    user_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    duration_ms: number;
    turns: number;
  };
}

export interface AgentRunFailedPayload extends WebhookEventBase {
  type: "agent.run.failed";
  data: {
    run_id: string;
    agent_id: string;
    user_id: string;
    error_code: string;
    error_message: string;
  };
}

export interface SubscriptionUpdatedPayload extends WebhookEventBase {
  type: "subscription.updated";
  data: {
    user_id: string;
    old_tier: string;
    new_tier: string;
  };
}

export interface UsageQuotaWarningPayload extends WebhookEventBase {
  type: "usage.quota_warning";
  data: {
    user_id: string;
    tokens_used: number;
    tokens_limit: number;
    pct_used: number;
  };
}

export interface UsageQuotaExceededPayload extends WebhookEventBase {
  type: "usage.quota_exceeded";
  data: {
    user_id: string;
    tokens_used: number;
    tokens_limit: number;
  };
}

export type WebhookPayload =
  | AgentRunStartedPayload
  | AgentRunCompletedPayload
  | AgentRunFailedPayload
  | SubscriptionUpdatedPayload
  | UsageQuotaWarningPayload
  | UsageQuotaExceededPayload;
