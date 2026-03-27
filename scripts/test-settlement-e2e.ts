/**
 * test-settlement-e2e.ts
 *
 * End-to-end test of the Maschina settlement program on devnet.
 * Runs the full economics flow and verifies the 70/15/10/5 USDC split.
 *
 * Run:
 *   npx tsx scripts/test-settlement-e2e.ts
 *
 * Prerequisites:
 *   - PR 171 merged + anchor build completed (generates IDL)
 *   - Settlement program deployed to devnet (SETTLEMENT_PROGRAM_ID in env)
 *   - Devnet SOL balance on authority keypair
 *   - HELIUS_API_KEY in env (optional)
 *
 * What this tests:
 *   1. init_node_vault  — creates per-node USDC vault (PDA token account)
 *   2. deposit_stake    — node runner deposits 100 USDC collateral
 *   3. add_earnings     — authority records 10 USDC earnings for a completed job
 *   4. settle_earnings  — distributes vault: 70/15/10/5 to operator/treasury/developer/validators
 *   5. Verifies all balances match expected amounts
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const CLUSTER = (process.env.SOLANA_CLUSTER ?? "devnet") as "devnet" | "mainnet-beta";

// Economics constants — must match programs/settlement/src/instructions/settle_earnings.rs
const NODE_BPS = 7000; // 70%
const TREASURY_BPS = 1500; // 15%
const DEVELOPER_BPS = 1000; // 10%
const VALIDATOR_BPS = 500; // 5%

// Test amounts (USDC, 6 decimals)
const STAKE_AMOUNT = 100_000_000; // 100 USDC
const EARNINGS_AMOUNT = 10_000_000; // 10 USDC per job

// Expected settle amounts
const EXPECTED_NODE = Math.floor((EARNINGS_AMOUNT * NODE_BPS) / 10_000); // 7_000_000
const EXPECTED_TREASURY = Math.floor((EARNINGS_AMOUNT * TREASURY_BPS) / 10_000); // 1_500_000
const EXPECTED_DEVELOPER = Math.floor((EARNINGS_AMOUNT * DEVELOPER_BPS) / 10_000); // 1_000_000
const EXPECTED_VALIDATORS =
  EARNINGS_AMOUNT - EXPECTED_NODE - EXPECTED_TREASURY - EXPECTED_DEVELOPER; // 500_000 (remainder)

function getRpcUrl(): string {
  const apiKey = process.env.HELIUS_API_KEY;
  if (apiKey) {
    return CLUSTER === "mainnet-beta"
      ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
      : `https://devnet.helius-rpc.com/?api-key=${apiKey}`;
  }
  return CLUSTER === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

function loadKeypair(): Keypair {
  const walletPath =
    process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json");
  const raw = fs.readFileSync(walletPath, "utf-8");
  const bytes = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function loadIdl() {
  const idlPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "programs",
    "settlement",
    "target",
    "idl",
    "settlement.json",
  );
  if (!fs.existsSync(idlPath)) {
    console.error(`IDL not found at ${idlPath}`);
    console.error("Run `cd programs && anchor build` first.");
    process.exit(1);
  }
  const require = createRequire(import.meta.url);
  return require(idlPath);
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function check(label: string, actual: bigint, expected: number) {
  const ok = Number(actual) === expected;
  const mark = ok ? "✓" : "✗";
  console.log(
    `  ${mark} ${label}: ${actual} USDC lamports (expected ${expected}) ${ok ? "" : "<-- MISMATCH"}`,
  );
  if (!ok) process.exitCode = 1;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Maschina Settlement E2E Test");
  console.log(`Cluster: ${CLUSTER}\n`);

  const connection = new Connection(getRpcUrl(), "confirmed");
  const authority = loadKeypair();
  const wallet = new anchor.Wallet(authority);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = loadIdl();
  const programId = new PublicKey(
    process.env.SETTLEMENT_PROGRAM_ID ?? "11111111111111111111111111111111",
  );

  if (programId.equals(new PublicKey("11111111111111111111111111111111"))) {
    console.error("SETTLEMENT_PROGRAM_ID not set. Deploy the program first.");
    process.exit(1);
  }

  const program = new Program(idl, programId, provider);

  console.log(`Authority:  ${authority.publicKey.toBase58()}`);
  console.log(`Program ID: ${programId.toBase58()}`);

  const balance = await connection.getBalance(authority.publicKey);
  console.log(`SOL balance: ${balance / 1e9}`);
  if (balance < 0.5 * 1e9) {
    console.error("Need at least 0.5 SOL. Run: solana airdrop 2 --url devnet");
    process.exit(1);
  }

  // ── Step 1: Create a test USDC mint ─────────────────────────────────────────
  // On devnet we create our own USDC-like mint for testing.
  // On mainnet you'd use the real USDC mint from USDC_MINT_MAINNET.

  console.log("\n[1/5] Creating test USDC mint...");
  const usdcMint = await createMint(
    connection,
    authority,
    authority.publicKey, // mint authority
    authority.publicKey, // freeze authority
    6, // decimals (matches real USDC)
  );
  console.log(`      Test USDC mint: ${usdcMint.toBase58()}`);

  // ── Step 2: Create ATAs and mint test USDC ───────────────────────────────────

  console.log("\n[2/5] Setting up token accounts...");

  // Authority is both the Maschina authority AND acts as operator for this test
  const authorityUsdc = await createAssociatedTokenAccount(
    connection,
    authority,
    usdcMint,
    authority.publicKey,
  );

  // Create separate parties for the settlement split
  const operatorKeypair = Keypair.generate();
  const treasuryKeypair = Keypair.generate();
  const developerKeypair = Keypair.generate();
  const validatorsKeypair = Keypair.generate();

  const operatorUsdc = await createAssociatedTokenAccount(
    connection,
    authority,
    usdcMint,
    operatorKeypair.publicKey,
  );
  const treasuryUsdc = await createAssociatedTokenAccount(
    connection,
    authority,
    usdcMint,
    treasuryKeypair.publicKey,
  );
  const developerUsdc = await createAssociatedTokenAccount(
    connection,
    authority,
    usdcMint,
    developerKeypair.publicKey,
  );
  const validatorsUsdc = await createAssociatedTokenAccount(
    connection,
    authority,
    usdcMint,
    validatorsKeypair.publicKey,
  );

  // Mint enough USDC to authority for stake + earnings
  const mintAmount = STAKE_AMOUNT + EARNINGS_AMOUNT + 1_000_000; // buffer
  await mintTo(connection, authority, usdcMint, authorityUsdc, authority, mintAmount);
  console.log(`      Minted ${mintAmount / 1e6} USDC to authority`);

  // ── Step 3: Initialize node accounts ────────────────────────────────────────

  const nodeId = uuidToBytes("00000000-0000-0000-0000-000000000001");
  console.log("\n[3/5] Initialising node vault...");

  await program.methods
    .initNodeVault({ nodeId: Array.from(nodeId) })
    .accounts({
      authority: authority.publicKey,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log("      init_node_vault: OK");

  // ── Step 4: Deposit stake ────────────────────────────────────────────────────

  console.log("\n[4/5] Depositing stake...");
  await program.methods
    .depositStake({ nodeId: Array.from(nodeId), amount: new BN(STAKE_AMOUNT) })
    .accounts({
      authority: authority.publicKey,
      authorityUsdc,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log(`      deposit_stake: ${STAKE_AMOUNT / 1e6} USDC deposited`);

  // ── Step 5: Add earnings for a fake job ─────────────────────────────────────

  const runId = uuidToBytes("aaaaaaaa-0000-0000-0000-000000000001");
  const agentId = uuidToBytes("bbbbbbbb-0000-0000-0000-000000000001");
  const userId = uuidToBytes("cccccccc-0000-0000-0000-000000000001");

  console.log("\n[5/5] Recording earnings + settling...");
  await program.methods
    .addEarnings({
      nodeId: Array.from(nodeId),
      runId: Array.from(runId),
      totalAmount: new BN(EARNINGS_AMOUNT),
    })
    .accounts({
      authority: authority.publicKey,
      authorityUsdc,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log(`      add_earnings: ${EARNINGS_AMOUNT / 1e6} USDC added to vault`);

  // ── Step 6: Settle earnings ──────────────────────────────────────────────────

  await program.methods
    .settleEarnings({ nodeId: Array.from(nodeId) })
    .accounts({
      authority: authority.publicKey,
      operatorUsdc,
      treasuryUsdc,
      developerUsdc,
      validatorsUsdc,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log("      settle_earnings: OK");

  // ── Step 7: Verify balances ──────────────────────────────────────────────────

  console.log("\n--- Balance verification ---");
  console.log(
    `Economics: ${NODE_BPS / 100}% node / ${TREASURY_BPS / 100}% treasury / ${DEVELOPER_BPS / 100}% developer / ${VALIDATOR_BPS / 100}% validators`,
  );
  console.log(`Input: ${EARNINGS_AMOUNT / 1e6} USDC\n`);

  const operatorBal = (await getAccount(connection, operatorUsdc)).amount;
  const treasuryBal = (await getAccount(connection, treasuryUsdc)).amount;
  const developerBal = (await getAccount(connection, developerUsdc)).amount;
  const validatorsBal = (await getAccount(connection, validatorsUsdc)).amount;

  check("Operator   (70%)", operatorBal, EXPECTED_NODE);
  check("Treasury   (15%)", treasuryBal, EXPECTED_TREASURY);
  check("Developer  (10%)", developerBal, EXPECTED_DEVELOPER);
  check("Validators  (5%)", validatorsBal, EXPECTED_VALIDATORS);

  const total = operatorBal + treasuryBal + developerBal + validatorsBal;
  const totalOk = Number(total) === EARNINGS_AMOUNT;
  console.log(
    `\n  ${totalOk ? "✓" : "✗"} Total distributed: ${total} / ${EARNINGS_AMOUNT} USDC lamports`,
  );
  if (!totalOk) process.exitCode = 1;

  if (process.exitCode === 1) {
    console.log("\nSome checks failed. Review the settlement program split logic.");
  } else {
    console.log("\n✓ All checks passed. Settlement economics verified.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
