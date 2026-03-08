import { db } from "@maschina/db";
import { notifications } from "@maschina/db";
import { Subjects } from "@maschina/events";
import { publishSafe } from "@maschina/nats";
import type { NotificationChannel, NotificationPayload, NotificationType } from "./types.js";

// ─── Dispatch a notification ──────────────────────────────────────────────────
// 1. Writes an in_app notification row to PostgreSQL (the notification bell)
// 2. Publishes a NATS event so the email worker and push worker can react
//
// This function is fire-and-forget safe — call with .catch() at call sites.

export async function notify(payload: NotificationPayload): Promise<void> {
  const { type, userId, channels, data } = payload;

  // Always persist in-app notifications so the bell/feed works offline
  if (channels.includes("in_app")) {
    await db
      .insert(notifications)
      .values({
        userId,
        type: type as any,
        payload: data,
      })
      .onConflictDoNothing();
  }

  // Publish to NATS so email + push workers can pick it up
  publishSafe(Subjects.NotificationRequested, {
    userId,
    type,
    channels,
    payload: data,
  });
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

export async function notifyAgentCompleted(opts: {
  userId: string;
  runId: string;
  agentId: string;
  agentName: string;
  durationMs: number;
  channels?: NotificationChannel[];
}): Promise<void> {
  await notify({
    type: "agent_run_completed",
    userId: opts.userId,
    channels: opts.channels ?? ["in_app"],
    data: {
      runId: opts.runId,
      agentId: opts.agentId,
      agentName: opts.agentName,
      durationMs: opts.durationMs,
    },
  });
}

export async function notifyAgentFailed(opts: {
  userId: string;
  runId: string;
  agentId: string;
  agentName: string;
  errorCode: string;
  channels?: NotificationChannel[];
}): Promise<void> {
  await notify({
    type: "agent_run_failed",
    userId: opts.userId,
    channels: opts.channels ?? ["in_app", "email"],
    data: {
      runId: opts.runId,
      agentId: opts.agentId,
      agentName: opts.agentName,
      errorCode: opts.errorCode,
    },
  });
}

export async function notifyQuotaWarning(opts: {
  userId: string;
  quotaType: string;
  percentageUsed: number;
  resetsAt: string;
}): Promise<void> {
  await notify({
    type: "usage_quota_warning",
    userId: opts.userId,
    channels: ["in_app", "email"],
    data: {
      quotaType: opts.quotaType,
      percentageUsed: opts.percentageUsed,
      resetsAt: opts.resetsAt,
    },
  });
}

export async function notifyQuotaExceeded(opts: {
  userId: string;
  quotaType: string;
  resetsAt: string;
  upgradeUrl: string;
}): Promise<void> {
  await notify({
    type: "usage_quota_exceeded",
    userId: opts.userId,
    channels: ["in_app", "email"],
    data: {
      quotaType: opts.quotaType,
      resetsAt: opts.resetsAt,
      upgradeUrl: opts.upgradeUrl,
    },
  });
}

export async function notifyPaymentFailed(opts: {
  userId: string;
  invoiceId: string;
  amountCents: number;
  retryDate: string;
  portalUrl: string;
}): Promise<void> {
  await notify({
    type: "billing_payment_failed",
    userId: opts.userId,
    channels: ["in_app", "email"],
    data: {
      invoiceId: opts.invoiceId,
      amountCents: opts.amountCents,
      retryDate: opts.retryDate,
      portalUrl: opts.portalUrl,
    },
  });
}
