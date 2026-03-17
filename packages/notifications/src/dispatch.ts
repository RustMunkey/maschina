import { db } from "@maschina/db";
import { alerts, notifications, pushTokens } from "@maschina/db";
import { eq } from "@maschina/db";
import { Subjects } from "@maschina/events";
import { publishSafe } from "@maschina/nats";
import { sendPushToTargets } from "@maschina/push";
import type { PushSubscription, PushTarget } from "@maschina/push";
import type { NotificationChannel, NotificationPayload, NotificationType } from "./types.js";

// ─── Core dispatch ────────────────────────────────────────────────────────────
// 1. in_app   → write notification row (bell feed)
// 2. alert    → write alert row (persistent banner)
// 3. push     → deliver to all registered device/browser tokens
// 4. email    → publish NATS event for the email worker
//
// Fire-and-forget safe — call with .catch() at call sites.

export async function notify(payload: NotificationPayload): Promise<void> {
  const { type, userId, channels, data } = payload;

  if (channels.includes("in_app")) {
    await db
      .insert(notifications)
      .values({ userId, type: type as any, payload: data })
      .onConflictDoNothing();
  }

  if (channels.includes("alert")) {
    const alertData = data as Record<string, unknown>;
    await db.insert(alerts).values({
      userId,
      type: type as any,
      severity: (alertData.severity as any) ?? _defaultSeverity(type),
      title: (alertData.title as string) ?? _defaultTitle(type),
      message: (alertData.message as string) ?? JSON.stringify(data),
      data: (alertData.data as any) ?? data,
      actionUrl: alertData.actionUrl as string | undefined,
    });
  }

  if (channels.includes("push")) {
    // Fire-and-forget — don't block the caller
    _deliverPush(userId, type, data).catch(() => {});
  }

  // Email + future channels go via NATS (email worker picks it up)
  if (channels.includes("email")) {
    publishSafe(Subjects.NotificationRequested, {
      userId,
      type,
      channels: ["email"],
      payload: data,
    });
  }
}

async function _deliverPush(
  userId: string,
  type: NotificationType,
  data: Record<string, unknown>,
): Promise<void> {
  const tokens = await db.select().from(pushTokens).where(eq(pushTokens.userId, userId));

  if (tokens.length === 0) return;

  const targets: PushTarget[] = tokens.map((t: (typeof tokens)[number]) => ({
    id: t.id,
    platform: t.platform,
    subscription: t.subscription as PushSubscription,
  }));

  const msg = {
    title: _pushTitle(type),
    body: _pushBody(type, data),
    data: _pushData(type, data),
  };

  const toDelete = await sendPushToTargets(targets, msg);

  if (toDelete.length > 0) {
    // Clean up expired/unregistered tokens
    for (const id of toDelete) {
      await db
        .delete(pushTokens)
        .where(eq(pushTokens.id, id))
        .catch(() => {});
    }
  }
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
    channels: opts.channels ?? ["in_app", "push"],
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
    channels: opts.channels ?? ["in_app", "push", "email"],
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
    channels: ["in_app", "alert"],
    data: {
      severity: "warning",
      title: "Approaching usage limit",
      message: `${opts.quotaType} is at ${opts.percentageUsed}% — resets ${opts.resetsAt}`,
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
    channels: ["in_app", "alert", "push", "email"],
    data: {
      severity: "error",
      title: "Usage limit reached",
      message: `${opts.quotaType} quota exceeded — resets ${opts.resetsAt}`,
      actionUrl: opts.upgradeUrl,
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
    channels: ["in_app", "alert", "push", "email"],
    data: {
      severity: "critical",
      title: "Payment failed",
      message: `We couldn't charge $${(opts.amountCents / 100).toFixed(2)} — retry ${opts.retryDate}`,
      actionUrl: opts.portalUrl,
      invoiceId: opts.invoiceId,
      amountCents: opts.amountCents,
      retryDate: opts.retryDate,
      portalUrl: opts.portalUrl,
    },
  });
}

// ─── Push message formatters ──────────────────────────────────────────────────

function _pushTitle(type: NotificationType): string {
  const titles: Record<NotificationType, string> = {
    agent_run_completed: "Run completed",
    agent_run_failed: "Run failed",
    usage_quota_warning: "Usage warning",
    usage_quota_exceeded: "Quota exceeded",
    billing_payment_failed: "Payment failed",
    billing_invoice_ready: "Invoice ready",
    team_invite_received: "Team invite",
    team_member_joined: "New team member",
    system_announcement: "Maschina",
  };
  return titles[type] ?? "Maschina";
}

function _pushBody(type: NotificationType, data: Record<string, unknown>): string {
  switch (type) {
    case "agent_run_completed":
      return `${data.agentName ?? "Agent"} finished in ${Math.round(Number(data.durationMs ?? 0) / 1000)}s`;
    case "agent_run_failed":
      return `${data.agentName ?? "Agent"} failed (${data.errorCode ?? "unknown error"})`;
    case "usage_quota_warning":
      return `${data.quotaType} is at ${data.percentageUsed}%`;
    case "usage_quota_exceeded":
      return `${data.quotaType} quota exceeded`;
    case "billing_payment_failed":
      return `Couldn't process $${(Number(data.amountCents ?? 0) / 100).toFixed(2)}`;
    case "billing_invoice_ready":
      return "Your latest invoice is ready";
    case "team_invite_received":
      return `${data.inviterName ?? "Someone"} invited you to ${data.orgName ?? "a team"}`;
    case "team_member_joined":
      return "A new member joined your team";
    case "system_announcement":
      return String(data.message ?? "");
  }
}

function _pushData(type: NotificationType, data: Record<string, unknown>): Record<string, string> {
  return {
    type,
    runId: String(data.runId ?? ""),
    agentId: String(data.agentId ?? ""),
  };
}

function _defaultSeverity(type: NotificationType): "info" | "warning" | "error" | "critical" {
  switch (type) {
    case "agent_run_failed":
    case "usage_quota_exceeded":
      return "error";
    case "billing_payment_failed":
      return "critical";
    case "usage_quota_warning":
      return "warning";
    default:
      return "info";
  }
}

function _defaultTitle(type: NotificationType): string {
  return _pushTitle(type);
}
