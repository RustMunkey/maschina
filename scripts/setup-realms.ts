/**
 * setup-realms.ts
 *
 * Creates the Maschina DAO realm on Solana using SPL Governance (Realms).
 * Run AFTER setup-mach-token.ts — requires MACH_MINT_ADDRESS in env.
 *
 * Run:
 *   MACH_MINT_ADDRESS=<mint> npx tsx scripts/setup-realms.ts
 *
 * Prerequisites:
 *   - Solana CLI installed: solana --version
 *   - Keypair at ~/.config/solana/id.json (or set ANCHOR_WALLET)
 *   - Devnet SOL balance
 *   - MACH_MINT_ADDRESS set (from setup-mach-token.ts output)
 *   - HELIUS_API_KEY in env (optional)
 *
 * Output:
 *   Prints the Realm address. Save it to .env as REALM_ADDRESS.
 *
 * What this creates:
 *   - A Realms DAO named "Maschina"
 *   - MACH token holders can create + vote on proposals
 *   - Min 1 MACH (1_000_000 lamports) to create a governance proposal
 *   - Community voting threshold: 60%
 *   - Vote duration: 7 days
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  GovernanceConfig,
  MintMaxVoteWeightSource,
  PROGRAM_VERSION_V3,
  VoteThresholdPercentage,
  VoteThresholdType,
  VoteTipping,
  getGovernanceProgramVersion,
  getRealm,
  withCreateRealm,
} from "@solana/spl-governance";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import BN from "bn.js";

// ─── Config ───────────────────────────────────────────────────────────────────

// Realms program — same address on devnet and mainnet
const GOVERNANCE_PROGRAM_ID = new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPiCXie");

const REALM_NAME = "Maschina";

// 1 MACH (6 decimals) minimum to create a governance proposal
const MIN_TOKENS_TO_CREATE_GOVERNANCE = new BN(1_000_000);

const CLUSTER = (process.env.SOLANA_CLUSTER ?? "devnet") as "devnet" | "mainnet-beta";

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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const machMintAddress = process.env.MACH_MINT_ADDRESS;
  if (!machMintAddress) {
    console.error("MACH_MINT_ADDRESS is required. Run setup-mach-token.ts first.");
    process.exit(1);
  }

  const connection = new Connection(getRpcUrl(), "confirmed");
  const authority = loadKeypair();
  const communityMint = new PublicKey(machMintAddress);

  console.log(`Authority:    ${authority.publicKey.toBase58()}`);
  console.log(`Cluster:      ${CLUSTER}`);
  console.log(`MACH mint:    ${machMintAddress}`);

  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Balance:      ${balance / 1e9} SOL`);

  if (balance < 0.1 * 1e9) {
    console.error("Insufficient SOL. Run: solana airdrop 2 --url devnet");
    process.exit(1);
  }

  // Detect which version of the Realms program is deployed
  const programVersion = await getGovernanceProgramVersion(connection, GOVERNANCE_PROGRAM_ID);
  console.log(`\nRealms program version: ${programVersion}`);

  // Build create-realm instruction
  const instructions: Parameters<typeof withCreateRealm>[0] = [];

  const realmAddress = await withCreateRealm(
    instructions,
    GOVERNANCE_PROGRAM_ID,
    programVersion,
    REALM_NAME,
    authority.publicKey, // realm authority
    communityMint,
    authority.publicKey, // payer
    undefined, // no council mint — MACH-only governance
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION, // all MACH supply counts for quorum
    MIN_TOKENS_TO_CREATE_GOVERNANCE,
  );

  const tx = new Transaction().add(...instructions);
  tx.feePayer = authority.publicKey;

  console.log("\nCreating Maschina DAO realm...");
  const sig = await sendAndConfirmTransaction(connection, tx, [authority], {
    commitment: "confirmed",
  });

  const realmAddressStr = realmAddress.toBase58();

  console.log("\n✓ Maschina DAO realm created");
  console.log(`  Realm:     ${realmAddressStr}`);
  console.log(`  Signature: ${sig}`);
  console.log(`  Realms UI: https://app.realms.today/dao/${realmAddressStr}?cluster=${CLUSTER}`);
  console.log("\nAdd to .env:");
  console.log(`  REALM_ADDRESS=${realmAddressStr}`);
  console.log("\nNext steps:");
  console.log("  1. Visit the Realms UI link above and connect your wallet");
  console.log("  2. Create the initial governance (Treasury, Operations)");
  console.log("  3. Deposit MACH tokens to vote");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
