/**
 * test-settlement-e2e.ts
 *
 * End-to-end test of the Maschina settlement program on localnet.
 * Runs the full economics flow and verifies the 70/15/10/5 USDC split.
 *
 * Prerequisites:
 *   1. solana-test-validator --reset (in another terminal)
 *   2. anchor build && anchor deploy (from programs/ directory)
 *   3. ~/.config/solana/id.json keypair with SOL
 *
 * Run:
 *   SETTLEMENT_PROGRAM_ID=BwFjSM25XTnUG18yX3H5bk6M2CMyBS367pV4A41C8UUb \
 *   SOLANA_CLUSTER=localnet npx tsx scripts/test-settlement-e2e.ts
 *
 * What this tests:
 *   1. initialize_config — one-time global config: sets trusted payout account owners
 *   2. deposit_stake     — node operator deposits 100 USDC collateral (updates counter only)
 *   3. init_node_vault   — creates per-node USDC vault (PDA token account)
 *   4. add_earnings      — authority records 10 USDC earnings with 70/15/10/5 split
 *   5. settle_earnings   — distributes vault: 70/15/10/5 to operator/treasury/developer/validators
 *   6. Verifies all balances match expected amounts
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
  mintTo,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const CLUSTER = process.env.SOLANA_CLUSTER ?? "localnet";

// Economics constants — must match programs/settlement/src/instructions/add_earnings.rs
// 70% node / 15% treasury / 10% developer / 5% validators
const NODE_BPS = 7000;
const TREASURY_BPS = 1500;
const DEVELOPER_BPS = 1000;
const VALIDATOR_BPS = 500;

// Test amounts (USDC, 6 decimals)
const STAKE_AMOUNT = 100_000_000; // 100 USDC (counter only — no real transfer in deposit_stake)
const EARNINGS_AMOUNT = 10_000_000; // 10 USDC

// Pre-compute split (mirrors the authority's responsibility to compute before calling add_earnings)
const NODE_AMOUNT = Math.floor((EARNINGS_AMOUNT * NODE_BPS) / 10_000); // 7_000_000
const TREASURY_AMOUNT = Math.floor((EARNINGS_AMOUNT * TREASURY_BPS) / 10_000); // 1_500_000
const DEVELOPER_AMOUNT = Math.floor((EARNINGS_AMOUNT * DEVELOPER_BPS) / 10_000); // 1_000_000
const VALIDATOR_AMOUNT = EARNINGS_AMOUNT - NODE_AMOUNT - TREASURY_AMOUNT - DEVELOPER_AMOUNT; // 500_000 (remainder)

function getRpcUrl(): string {
  if (CLUSTER === "localnet") return "http://127.0.0.1:8899";
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
  console.log(`  ${mark} ${label}: ${actual} (expected ${expected})${ok ? "" : "  <-- MISMATCH"}`);
  if (!ok) process.exitCode = 1;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Maschina Settlement E2E Test");
  console.log(`Cluster: ${CLUSTER}`);
  console.log(
    `Economics: ${NODE_BPS / 100}% node / ${TREASURY_BPS / 100}% treasury / ${DEVELOPER_BPS / 100}% developer / ${VALIDATOR_BPS / 100}% validators\n`,
  );

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

  // biome-ignore lint/suspicious/noExplicitAny: Anchor IDL requires any
  const program = new Program(idl as any, provider);

  console.log(`Authority:  ${authority.publicKey.toBase58()}`);
  console.log(`Program ID: ${programId.toBase58()}`);

  const balance = await connection.getBalance(authority.publicKey);
  console.log(`SOL balance: ${(balance / 1e9).toFixed(4)}`);
  if (balance < 0.5 * 1e9) {
    console.error("Need at least 0.5 SOL. On localnet run: solana airdrop 5");
    process.exit(1);
  }

  // ── Step 1: Create a test USDC mint ─────────────────────────────────────────
  console.log("\n[1/6] Creating test USDC mint...");
  const usdcMint = await createMint(
    connection,
    authority,
    authority.publicKey,
    authority.publicKey,
    6,
  );
  console.log(`      Mint: ${usdcMint.toBase58()}`);

  // ── Step 2: Set up token accounts and mint test USDC ────────────────────────
  console.log("\n[2/6] Setting up token accounts...");

  // The operator is a separate keypair so we can clearly verify operator_usdc received exactly NODE_AMOUNT.
  // On localnet we airdrop SOL to operator so it can sign deposit_stake.
  const operatorKeypair = Keypair.generate();
  const treasuryKeypair = Keypair.generate();
  const developerKeypair = Keypair.generate();
  const validatorsKeypair = Keypair.generate();

  // Airdrop SOL to operator so it can pay for deposit_stake account creation
  const airdropSig = await connection.requestAirdrop(operatorKeypair.publicKey, 1e9);
  await connection.confirmTransaction(airdropSig);
  console.log(`      Airdropped 1 SOL → operator ${operatorKeypair.publicKey.toBase58()}`);

  // Authority's USDC — source for add_earnings transfer
  const authorityUsdc = await createAssociatedTokenAccount(
    connection,
    authority,
    usdcMint,
    authority.publicKey,
  );
  // Operator's USDC — receives 70%
  const operatorUsdc = await createAssociatedTokenAccount(
    connection,
    authority,
    usdcMint,
    operatorKeypair.publicKey,
  );
  // Payout accounts
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

  // Mint USDC to authority for add_earnings
  await mintTo(
    connection,
    authority,
    usdcMint,
    authorityUsdc,
    authority,
    EARNINGS_AMOUNT + 1_000_000,
  );
  console.log(`      Minted ${(EARNINGS_AMOUNT + 1_000_000) / 1e6} USDC to authority`);

  // ── Step 3: Initialize settlement config ────────────────────────────────────
  console.log("\n[3/6] Initialising settlement config...");
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const configAccount = await connection.getAccountInfo(configPda);
  if (configAccount) {
    console.error("\nConfig PDA already exists from a previous run.");
    console.error("Reset the validator and redeploy before re-running:");
    console.error("  solana-test-validator --reset");
    console.error(
      "  solana program deploy programs/target/deploy/settlement.so --keypair ~/.config/solana/id.json --url http://127.0.0.1:8899 --program-id programs/target/deploy/settlement-keypair.json",
    );
    process.exit(1);
  }
  await program.methods
    .initializeConfig({
      treasuryKey: treasuryKeypair.publicKey,
      developerKey: developerKeypair.publicKey,
      validatorsKey: validatorsKeypair.publicKey,
    })
    .accounts({
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("      initialize_config: OK");

  // ── Step 4: Deposit stake (operator signs) ───────────────────────────────────
  // Note: deposit_stake in this version only updates the counter — no SPL transfer.
  const nodeId = uuidToBytes("00000000-0000-0000-0000-000000000001");
  console.log("\n[4/6] Depositing stake (operator signs)...");
  const operatorWallet = new anchor.Wallet(operatorKeypair);
  const operatorProvider = new AnchorProvider(connection, operatorWallet, {
    commitment: "confirmed",
  });
  // biome-ignore lint/suspicious/noExplicitAny: Anchor IDL requires any
  const operatorProgram = new Program(idl as any, operatorProvider);

  await operatorProgram.methods
    .depositStake({ nodeId: Array.from(nodeId), amount: new BN(STAKE_AMOUNT) })
    .accounts({
      operator: operatorKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`      deposit_stake: ${STAKE_AMOUNT / 1e6} USDC (counter only)`);

  // ── Step 5: Init node vault ──────────────────────────────────────────────────
  console.log("\n[5/6] Initialising node vault...");
  await program.methods
    .initNodeVault({ nodeId: Array.from(nodeId) })
    .accounts({
      payer: authority.publicKey,
      usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log("      init_node_vault: OK");

  // ── Step 6: Add earnings then settle ────────────────────────────────────────
  const runId = uuidToBytes("aaaaaaaa-0000-0000-0000-000000000001");
  console.log("\n[6/6] Adding earnings and settling...");
  console.log(
    `      Split: node=${NODE_AMOUNT / 1e6} treasury=${TREASURY_AMOUNT / 1e6} developer=${DEVELOPER_AMOUNT / 1e6} validators=${VALIDATOR_AMOUNT / 1e6} USDC`,
  );

  await program.methods
    .addEarnings({
      nodeId: Array.from(nodeId),
      runId: Array.from(runId),
      nodeAmount: new BN(NODE_AMOUNT),
      developerAmount: new BN(DEVELOPER_AMOUNT),
      treasuryAmount: new BN(TREASURY_AMOUNT),
      validatorAmount: new BN(VALIDATOR_AMOUNT),
    })
    .accounts({
      authority: authority.publicKey,
      usdcMint,
      authorityUsdc,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log("      add_earnings: OK");

  await program.methods
    .settleEarnings({ nodeId: Array.from(nodeId) })
    .accounts({
      authority: authority.publicKey,
      usdcMint,
      operatorUsdc,
      developerUsdc,
      treasuryUsdc,
      validatorsUsdc,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("      settle_earnings: OK");

  // ── Verify balances ──────────────────────────────────────────────────────────
  console.log("\n--- Balance verification ---");
  console.log(`Input: ${EARNINGS_AMOUNT / 1e6} USDC\n`);

  const operatorBal = (await getAccount(connection, operatorUsdc)).amount;
  const treasuryBal = (await getAccount(connection, treasuryUsdc)).amount;
  const developerBal = (await getAccount(connection, developerUsdc)).amount;
  const validatorsBal = (await getAccount(connection, validatorsUsdc)).amount;

  check("Operator   (70%)", operatorBal, NODE_AMOUNT);
  check("Treasury   (15%)", treasuryBal, TREASURY_AMOUNT);
  check("Developer  (10%)", developerBal, DEVELOPER_AMOUNT);
  check("Validators  (5%)", validatorsBal, VALIDATOR_AMOUNT);

  const total = operatorBal + treasuryBal + developerBal + validatorsBal;
  const totalOk = Number(total) === EARNINGS_AMOUNT;
  console.log(
    `\n  ${totalOk ? "✓" : "✗"} Total distributed: ${total} / ${EARNINGS_AMOUNT} lamports`,
  );
  if (!totalOk) process.exitCode = 1;

  if (process.exitCode !== 1) {
    console.log("\n✓ All checks passed. Settlement economics verified.");
  } else {
    console.log("\nSome checks failed. Review the settlement program split logic.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
