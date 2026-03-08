import { db } from "@maschina/db";
import { usageEvents } from "@maschina/db";
import { incrementQuota } from "./quota.js";
import type { RecordUsageInput } from "./types.js";

// ─── Record a usage event ─────────────────────────────────────────────────────
// Two-step write:
//   1. Increment Redis quota counter (synchronous — real-time enforcement)
//   2. Append to PostgreSQL usage_events (fire-and-forget — durable audit log)
//
// If the PostgreSQL write fails, the Redis counter is still correct.
// The nightly reconciliation job detects and corrects drift.
// Never fail the user request because of a usage recording failure.

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  // Step 1: Increment Redis counter (must succeed — this enforces the quota)
  await incrementQuota(input.userId, input.type, input.units);

  // Step 2: Append to PostgreSQL (fire-and-forget, don't await at call site if latency matters)
  appendEvent(input).catch((err) => {
    // Log but don't propagate — usage recording must never break the user action
    console.error("[usage] Failed to append event to PostgreSQL:", err);
    // TODO: push to dead-letter queue (packages/jobs) for retry
  });
}

async function appendEvent(input: RecordUsageInput): Promise<void> {
  await db.insert(usageEvents).values({
    userId: input.userId,
    apiKeyId: input.apiKeyId,
    type: input.type,
    units: input.units,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    model: input.model,
    agentId: input.agentId,
  });
}

// ─── Specialized: model inference ────────────────────────────────────────────
// Called after every LLM response. Token counts come from the model response —
// never pre-counted. Same pattern as Anthropic API (usage.input_tokens + output_tokens).

export async function recordModelInference(opts: {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  apiKeyId?: string;
  agentId?: string;
}): Promise<void> {
  const units = opts.inputTokens + opts.outputTokens;

  await recordUsage({
    userId: opts.userId,
    type: "model_inference",
    units,
    inputTokens: opts.inputTokens,
    outputTokens: opts.outputTokens,
    model: opts.model,
    apiKeyId: opts.apiKeyId,
    agentId: opts.agentId,
  });
}

// ─── Specialized: agent execution ────────────────────────────────────────────

export async function recordAgentExecution(opts: {
  userId: string;
  agentId: string;
  apiKeyId?: string;
}): Promise<void> {
  await recordUsage({
    userId: opts.userId,
    type: "agent_execution",
    units: 1,
    agentId: opts.agentId,
    apiKeyId: opts.apiKeyId,
  });
}

// ─── Specialized: API call ────────────────────────────────────────────────────

export async function recordApiCall(opts: {
  userId: string;
  apiKeyId?: string;
}): Promise<void> {
  await recordUsage({
    userId: opts.userId,
    type: "api_call",
    units: 1,
    apiKeyId: opts.apiKeyId,
  });
}
