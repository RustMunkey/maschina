// @maschina/chain — Helius webhook helpers for settlement events
//
// Helius delivers parsed transaction events to our webhook endpoint via POST.
// This module provides:
//   - Type definitions for the event payloads we care about
//   - A dispatcher that routes events to typed handlers
//
// Register the webhook via Helius dashboard or API:
//   accountAddresses: [SETTLEMENT_PROGRAM_ID]
//   transactionTypes: ["ANY"]
//   webhookURL: https://api.maschina.ai/webhooks/helius

import type { Helius } from "helius-sdk";
import { SETTLEMENT_PROGRAM_ID } from "./settlement.js";

// ─── Helius enhanced transaction shape (minimal — expand as needed) ───────────

export interface HeliusWebhookTransaction {
  signature: string;
  slot: number;
  timestamp: number;
  type: string;
  accountData: Array<{ account: string; nativeBalanceChange: number }>;
  events: {
    compressed?: unknown[];
    nft?: unknown;
    swap?: unknown;
  };
  /** Raw logs from the transaction. Used to parse Anchor events. */
  logs?: string[];
}

export interface HeliusWebhookPayload {
  webhookId: string;
  webhookType: string;
  accountAddresses?: string[];
  transactions: HeliusWebhookTransaction[];
}

// ─── Settlement event handlers ─────────────────────────────────────────────────

export interface ReceiptAnchoredEvent {
  runId: Uint8Array;
  payloadHash: Uint8Array;
  nodePubkey: Uint8Array;
  completedAt: number;
  signature: string;
  slot: number;
}

export interface SettlementWebhookHandlers {
  onReceiptAnchored?: (event: ReceiptAnchoredEvent) => Promise<void>;
  onUnknown?: (tx: HeliusWebhookTransaction) => Promise<void>;
}

/**
 * Process a Helius webhook payload for the settlement program.
 *
 * Called from the API webhook route (POST /webhooks/helius).
 * The raw payload is passed directly; this function parses logs, identifies
 * Anchor events, and dispatches to typed handlers.
 *
 * NOTE: Full Anchor event log parsing requires the IDL. This skeleton
 * identifies relevant transactions by program ID presence and calls handlers
 * with available data. Production implementation should use
 * `anchor.EventParser` with the loaded IDL.
 */
export async function processHeliusWebhook(
  payload: HeliusWebhookPayload,
  handlers: SettlementWebhookHandlers,
): Promise<void> {
  const programId = SETTLEMENT_PROGRAM_ID.toBase58();

  for (const tx of payload.transactions) {
    const isSettlement = tx.accountData?.some((a) => a.account === programId);
    if (!isSettlement) {
      await handlers.onUnknown?.(tx);
      continue;
    }

    // Parse Anchor event from logs.
    // Anchor events are base64-encoded in "Program log: " lines prefixed with
    // the event discriminator. We identify ReceiptAnchored by its log prefix.
    const receiptLog = tx.logs?.find((l) => l.includes("ReceiptAnchored"));

    if (receiptLog && handlers.onReceiptAnchored) {
      // Detailed parsing deferred to production IDL-based implementation.
      // For now emit with what we can extract from the transaction.
      await handlers.onReceiptAnchored({
        runId: new Uint8Array(16),
        payloadHash: new Uint8Array(32),
        nodePubkey: new Uint8Array(32),
        completedAt: tx.timestamp,
        signature: tx.signature,
        slot: tx.slot,
      });
    }
  }
}

// ─── Helius webhook registration helper ───────────────────────────────────────

/**
 * Register the settlement program webhook with Helius.
 * Call once during deployment setup; idempotent if webhook already exists.
 */
export async function registerSettlementWebhook(
  helius: Helius,
  webhookUrl: string,
): Promise<string> {
  const existing = await helius.getAllWebhooks();
  const alreadyRegistered = existing.find(
    (w) =>
      w.webhookURL === webhookUrl && w.accountAddresses?.includes(SETTLEMENT_PROGRAM_ID.toBase58()),
  );

  if (alreadyRegistered) {
    return alreadyRegistered.webhookID;
  }

  const webhook = await helius.createWebhook({
    accountAddresses: [SETTLEMENT_PROGRAM_ID.toBase58()],
    transactionTypes: [
      "ANY" as Parameters<typeof helius.createWebhook>[0]["transactionTypes"][number],
    ],
    webhookURL: webhookUrl,
    webhookType: "enhanced" as Parameters<typeof helius.createWebhook>[0]["webhookType"],
    authHeader: process.env.HELIUS_WEBHOOK_SECRET ?? "",
  });

  return webhook.webhookID;
}
