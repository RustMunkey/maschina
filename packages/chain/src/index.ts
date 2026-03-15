// @maschina/chain — Solana + Helius utilities

export { getHeliusClient, getHeliusRpcUrl, getCluster } from "./helius.js";
export type { SolanaCluster } from "./helius.js";

export { getConnection } from "./connection.js";

export { isValidSolanaAddress, normaliseSolanaAddress, getSolBalance } from "./wallet.js";

export { buildChallenge, verifyWalletSignature } from "./verify.js";

export {
  SETTLEMENT_PROGRAM_ID,
  receiptPda,
  stakePda,
  poolPda,
  getSettlementProgram,
  fetchReceipt,
  isReceiptAnchored,
  uuidToBytes,
  bytesToUuid,
} from "./settlement.js";
export type { AnchorReceiptArgs, OnChainReceipt } from "./settlement.js";

export {
  processHeliusWebhook,
  registerSettlementWebhook,
} from "./webhook.js";
export type {
  HeliusWebhookPayload,
  HeliusWebhookTransaction,
  ReceiptAnchoredEvent,
  SettlementWebhookHandlers,
} from "./webhook.js";
