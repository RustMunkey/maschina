// @maschina/chain — Anchor settlement program client
//
// Wraps the on-chain settlement program for:
//   - Anchoring execution receipts (tamper-proof run proof)
//   - Node stake deposit / withdrawal / slash
//   - Earnings settlement (65/20/10/5 split)
//
// The IDL is committed at programs/settlement/target/idl/settlement.json after
// `anchor build`. At runtime the IDL is loaded from there; in tests it is
// mocked via the Anchor workspace API.

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, web3 } from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { getConnection } from "./connection.js";

// ─── Constants ─────────────────────────────────────────────────────────────────

// Placeholder — replace with real program ID after `anchor build` and deploy.
// Must be a valid base58 public key even when CHAIN_ENABLED=false.
export const SETTLEMENT_PROGRAM_ID = new web3.PublicKey(
  process.env.SETTLEMENT_PROGRAM_ID ?? "11111111111111111111111111111111",
);

// ─── PDA helpers ──────────────────────────────────────────────────────────────

export function receiptPda(runId: Uint8Array): [web3.PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), Buffer.from(runId)],
    SETTLEMENT_PROGRAM_ID,
  );
}

export function stakePda(nodeId: Uint8Array): [web3.PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), Buffer.from(nodeId)],
    SETTLEMENT_PROGRAM_ID,
  );
}

export function poolPda(nodeId: Uint8Array): [web3.PublicKey, number] {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from(nodeId)],
    SETTLEMENT_PROGRAM_ID,
  );
}

// ─── Client factory ───────────────────────────────────────────────────────────

/**
 * Build an Anchor Program instance for the settlement program.
 *
 * @param wallet  - Anchor-compatible wallet (NodeWallet in server contexts).
 * @param idl     - IDL JSON loaded from programs/settlement/target/idl/settlement.json
 *
 * The caller is responsible for loading the IDL — this avoids a static import
 * of a large JSON file that only exists after `anchor build`.
 */
export function getSettlementProgram(wallet: anchor.Wallet, idl: Idl): Program {
  const connection = getConnection();
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  return new Program(idl, provider);
}

// ─── Receipt types ─────────────────────────────────────────────────────────────

export interface AnchorReceiptArgs {
  runId: Uint8Array; // 16 bytes
  payloadHash: Uint8Array; // 32 bytes
  nodeSignature: Uint8Array; // 64 bytes
  nodePubkey: Uint8Array; // 32 bytes
  agentId: Uint8Array; // 16 bytes
  userId: Uint8Array; // 16 bytes
  completedAt: number;
  inputTokens: bigint;
  outputTokens: bigint;
  billedUsdc: bigint;
}

export interface OnChainReceipt {
  runId: number[];
  payloadHash: number[];
  nodeSignature: number[];
  nodePubkey: number[];
  agentId: number[];
  userId: number[];
  completedAt: anchor.BN;
  inputTokens: anchor.BN;
  outputTokens: anchor.BN;
  bump: number;
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch an ExecutionReceipt account by run UUID bytes.
 * Returns null if the account does not exist (run was never anchored).
 */
export async function fetchReceipt(
  program: Program,
  runId: Uint8Array,
): Promise<OnChainReceipt | null> {
  const [pda] = receiptPda(runId);
  try {
    const account = await (
      program.account as Record<string, anchor.AccountClient>
    ).executionReceipt.fetch(pda);
    return account as OnChainReceipt;
  } catch {
    return null;
  }
}

/**
 * Check whether a run has been anchored on-chain.
 */
export async function isReceiptAnchored(program: Program, runId: Uint8Array): Promise<boolean> {
  const receipt = await fetchReceipt(program, runId);
  return receipt !== null;
}

// ─── UUID <-> bytes helpers ───────────────────────────────────────────────────

/** Convert a UUID string (with or without dashes) to a 16-byte Uint8Array. */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Convert a 16-byte Uint8Array back to a UUID string. */
export function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
