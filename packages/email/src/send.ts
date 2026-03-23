/**
 * Email dispatch helpers.
 *
 * All functions are no-ops when RESEND_API_KEY is not set, so the rest of the
 * system can import and call them unconditionally — sending will just be skipped
 * until the API key is configured (post-domain setup).
 */

import { renderAsync } from "@react-email/components";
import * as React from "react";
import { FROM_ADDRESS, getResend } from "./client.js";
import { AgentCompleted } from "./templates/AgentCompleted.js";
import { BillingReceipt } from "./templates/BillingReceipt.js";
import { EmailVerification } from "./templates/EmailVerification.js";
import { MagicCode } from "./templates/MagicCode.js";
import { PasswordReset } from "./templates/PasswordReset.js";
import { PaymentFailed } from "./templates/PaymentFailed.js";

const ENABLED = !!process.env.RESEND_API_KEY;

async function send(opts: {
  to: string;
  subject: string;
  react: React.ReactElement;
}): Promise<void> {
  if (!ENABLED) return;

  const html = await renderAsync(opts.react);
  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: opts.to,
    subject: opts.subject,
    html,
  });
}

export async function sendMagicCode(opts: {
  to: string;
  code: string;
  expiresInMinutes?: number;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `${opts.code} is your Maschina sign-in code`,
    react: React.createElement(MagicCode, {
      code: opts.code,
      expiresInMinutes: opts.expiresInMinutes ?? 10,
    }),
  });
}

export async function sendEmailVerification(opts: {
  to: string;
  verificationUrl: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: "Verify your Maschina account",
    react: React.createElement(EmailVerification, { verificationUrl: opts.verificationUrl }),
  });
}

export async function sendPasswordReset(opts: {
  to: string;
  resetUrl: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: "Reset your Maschina password",
    react: React.createElement(PasswordReset, { resetUrl: opts.resetUrl }),
  });
}

export async function sendAgentCompleted(opts: {
  to: string;
  agentName: string;
  runId: string;
  dashboardUrl: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Agent "${opts.agentName}" completed`,
    react: React.createElement(AgentCompleted, opts),
  });
}

export async function sendBillingReceipt(opts: {
  to: string;
  amountCents: number;
  description: string;
  invoiceUrl?: string;
  periodEnd: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: "Your Maschina receipt",
    react: React.createElement(BillingReceipt, opts),
  });
}

export async function sendPaymentFailed(opts: {
  to: string;
  amountCents: number;
  updatePaymentUrl: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: "Action required: payment failed",
    react: React.createElement(PaymentFailed, opts),
  });
}
