import { randomUUID } from "node:crypto";
import { getJs } from "@maschina/nats";
import type { EventEnvelope } from "@maschina/events";
import { type Job, jobSubject } from "./types.js";

// ─── Dispatch a job to NATS JetStream ────────────────────────────────────────
// Wraps the job in an EventEnvelope for consistent processing + idempotency.
// The daemon and other consumers pull from the MASCHINA_JOBS stream.

export async function dispatch(job: Job): Promise<string> {
  const js = await getJs();
  const id = randomUUID();

  const envelope: EventEnvelope<Job> = {
    id,
    timestamp: new Date().toISOString(),
    version:   1,
    subject:   jobSubject(job),
    data:      job,
  };

  await js.publish(
    jobSubject(job),
    new TextEncoder().encode(JSON.stringify(envelope)),
  );

  return id; // caller can use for idempotency tracking
}

// ─── Dispatch helpers for each job type ──────────────────────────────────────

export async function dispatchAgentRun(opts: {
  runId:       string;
  agentId:     string;
  userId:      string;
  tier:        string;
  inputPayload: unknown;
  timeoutSecs: number;
}): Promise<string> {
  return dispatch({ type: "agent.execute", ...opts });
}

export async function dispatchEmailVerification(opts: {
  userId: string;
  email:  string;
  token:  string;
}): Promise<string> {
  return dispatch({ type: "email.verification", ...opts });
}

export async function dispatchEmailPasswordReset(opts: {
  userId: string;
  email:  string;
  token:  string;
}): Promise<string> {
  return dispatch({ type: "email.password_reset", ...opts });
}

export async function dispatchEmailBillingReceipt(opts: {
  userId:      string;
  email:       string;
  invoiceId:   string;
  amountCents: number;
  periodEnd:   string;
}): Promise<string> {
  return dispatch({ type: "email.billing_receipt", ...opts });
}

export async function dispatchEmailPaymentFailed(opts: {
  userId:      string;
  email:       string;
  invoiceId:   string;
  amountCents: number;
}): Promise<string> {
  return dispatch({ type: "email.payment_failed", ...opts });
}

export async function dispatchReconcile(opts: {
  userId: string;
  period: string;
}): Promise<string> {
  return dispatch({ type: "billing.reconcile", ...opts });
}

export async function dispatchPruneSessions(): Promise<string> {
  return dispatch({ type: "maintenance.prune_sessions" });
}

export async function dispatchPruneTokens(): Promise<string> {
  return dispatch({ type: "maintenance.prune_tokens" });
}
