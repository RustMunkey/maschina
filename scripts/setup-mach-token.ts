/**
 * setup-mach-token.ts
 *
 * Creates the MACH token on Solana devnet using Token-2022 with metadata.
 *
 * Run:
 *   npx tsx scripts/setup-mach-token.ts
 *
 * Prerequisites:
 *   - Solana CLI installed: solana --version
 *   - Keypair at ~/.config/solana/id.json (or set ANCHOR_WALLET)
 *   - Devnet SOL balance (airdrop: solana airdrop 2 --url devnet)
 *   - HELIUS_API_KEY in env (optional — falls back to public devnet RPC)
 *
 * Output:
 *   Prints the MACH mint address. Save it to .env as MACH_MINT_ADDRESS.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from "@solana/spl-token";
import { type TokenMetadata, createInitializeInstruction, pack } from "@solana/spl-token-metadata";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const MACH_TOKEN = {
  name: "Maschina",
  symbol: "MACH",
  decimals: 6, // Match USDC — makes on-chain math simpler
  uri: "https://arweave.net/FSdeaS34qV2Z5ij95wcm9QdnSHkuyfRrsMhFGJ65yq8T",
  // Initial supply minted to authority — 0 for now (minted on demand per distribution schedule)
  initialSupply: 0n,
} as const;

const CLUSTER = process.env.SOLANA_CLUSTER ?? "devnet";

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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const connection = new Connection(getRpcUrl(), "confirmed");
  const authority = loadKeypair();

  console.log(`Authority: ${authority.publicKey.toBase58()}`);
  console.log(`Cluster:   ${CLUSTER}`);

  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Balance:   ${balance / 1e9} SOL`);

  if (balance < 0.1 * 1e9) {
    console.error("Insufficient SOL. Run: solana airdrop 2 --url devnet");
    process.exit(1);
  }

  // Generate mint keypair and save it — loss of this file = loss of mint authority.
  const mintKeypair = Keypair.generate();
  const mintKeypairPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "wallets",
    "mach-mint.json",
  );
  fs.writeFileSync(mintKeypairPath, JSON.stringify(Array.from(mintKeypair.secretKey)));
  console.log(`\nMint keypair saved: ${mintKeypairPath}`);
  console.log(`Mint address: ${mintKeypair.publicKey.toBase58()}`);

  // ── Metadata ────────────────────────────────────────────────────────────────

  const metadata: TokenMetadata = {
    mint: mintKeypair.publicKey,
    name: MACH_TOKEN.name,
    symbol: MACH_TOKEN.symbol,
    uri: MACH_TOKEN.uri,
    additionalMetadata: [
      ["network", "maschina-agentic-network"],
      ["version", "1"],
    ],
  };

  const metadataExtension = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(
    mintLen + metadataExtension,
  );

  // ── Build transaction ────────────────────────────────────────────────────────

  const tx = new Transaction().add(
    // 1. Create mint account
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    // 2. Initialise metadata pointer (points to mint itself for on-chain metadata)
    createInitializeMetadataPointerInstruction(
      mintKeypair.publicKey,
      authority.publicKey, // metadata update authority
      mintKeypair.publicKey, // metadata stored on the mint account itself
      TOKEN_2022_PROGRAM_ID,
    ),
    // 3. Initialise mint
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      MACH_TOKEN.decimals,
      authority.publicKey, // mint authority
      authority.publicKey, // freeze authority (set to null before mainnet launch)
      TOKEN_2022_PROGRAM_ID,
    ),
    // 4. Initialise on-chain metadata
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mintKeypair.publicKey,
      updateAuthority: authority.publicKey,
      mint: mintKeypair.publicKey,
      mintAuthority: authority.publicKey,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
  );

  console.log("\nCreating MACH mint...");
  const sig = await sendAndConfirmTransaction(connection, tx, [authority, mintKeypair], {
    commitment: "confirmed",
  });

  const mintAddress = mintKeypair.publicKey.toBase58();

  console.log("\n✓ MACH token created");
  console.log(`  Mint:      ${mintAddress}`);
  console.log(`  Signature: ${sig}`);
  console.log(`  Explorer:  https://explorer.solana.com/address/${mintAddress}?cluster=devnet`);
  console.log("\nAdd to .env:");
  console.log(`  MACH_MINT_ADDRESS=${mintAddress}`);
  console.log("  SOLANA_CLUSTER=devnet");
}

// Token-2022 metadata size constants
const TYPE_SIZE = 2;
const LENGTH_SIZE = 4;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
