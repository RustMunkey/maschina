/**
 * Email job consumer.
 *
 * Consumes from the MASCHINA_JOBS stream (WorkQueue retention) for subjects
 * matching `maschina.jobs.email.*`. Each message is processed exactly once.
 *
 * Sending is no-op until RESEND_API_KEY is configured (deferred until domain).
 */

import { AckPolicy, DeliverPolicy } from "@maschina/nats";
import {
  sendAgentCompleted,
  sendBillingReceipt,
  sendEmailVerification,
  sendPasswordReset,
  sendPaymentFailed,
} from "@maschina/email";
import { getJs, getJsm } from "@maschina/nats";
import type {
  EmailAgentCompletedJob,
  EmailBillingReceiptJob,
  EmailJob,
  EmailPasswordResetJob,
  EmailPaymentFailedJob,
  EmailVerificationJob,
} from "@maschina/jobs";
import { env } from "../env.js";

const STREAM = "MASCHINA_JOBS";
const CONSUMER_NAME = "api-email-worker";
const FILTER_SUBJECT = "maschina.jobs.email.>";

const APP_URL = process.env["APP_URL"] ?? "http://localhost:5173";

export async function startEmailWorker(): Promise<void> {
  const jsm = await getJsm();
  const js = await getJs();

  // Idempotent consumer creation
  try {
    await jsm.consumers.add(STREAM, {
      durable_name: CONSUMER_NAME,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      filter_subject: FILTER_SUBJECT,
      max_deliver: 5,
      ack_wait: 60_000_000_000, // 60s in ns — emails may be slow
    });
  } catch (err: any) {
    if (!err?.message?.includes("consumer name already in use")) throw err;
  }

  const consumer = await js.consumers.get(STREAM, CONSUMER_NAME);
  const messages = await consumer.consume();

  console.log("[email-worker] consuming from", FILTER_SUBJECT);

  for await (const msg of messages) {
    let job: EmailJob;

    try {
      job = JSON.parse(new TextDecoder().decode(msg.data)) as EmailJob;
    } catch (err) {
      console.error("[email-worker] failed to parse job payload", err);
      msg.term(); // dead-letter malformed messages
      continue;
    }

    try {
      await dispatch(job);
      msg.ack();
    } catch (err) {
      console.error("[email-worker] job failed", { type: job.type, err });
      msg.nak(10_000); // retry after 10s
    }
  }
}

async function dispatch(job: EmailJob): Promise<void> {
  switch (job.type) {
    case "email.verification": {
      const j = job as EmailVerificationJob;
      await sendEmailVerification({
        to: j.email,
        verificationUrl: `${APP_URL}/verify-email?token=${j.token}`,
      });
      break;
    }

    case "email.password_reset": {
      const j = job as EmailPasswordResetJob;
      await sendPasswordReset({
        to: j.email,
        resetUrl: `${APP_URL}/reset-password?token=${j.token}`,
      });
      break;
    }

    case "email.billing_receipt": {
      const j = job as EmailBillingReceiptJob;
      await sendBillingReceipt({
        to: j.email,
        amountCents: j.amountCents,
        description: "Maschina subscription",
        periodEnd: j.periodEnd,
      });
      break;
    }

    case "email.agent_completed": {
      const j = job as EmailAgentCompletedJob;
      await sendAgentCompleted({
        to: j.email,
        agentName: j.agentName,
        runId: j.runId,
        dashboardUrl: `${APP_URL}/agents/${j.agentId}/runs/${j.runId}`,
      });
      break;
    }

    case "email.payment_failed": {
      const j = job as EmailPaymentFailedJob;
      await sendPaymentFailed({
        to: j.email,
        amountCents: j.amountCents,
        updatePaymentUrl: `${APP_URL}/billing`,
      });
      break;
    }

    default: {
      console.warn("[email-worker] unknown job type", (job as any).type);
    }
  }
}
