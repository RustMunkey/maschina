/**
 * update-token-uri.ts
 *
 * Updates the on-chain metadata URI for the MACH Token-2022 mint.
 * Run this after the new metadata file is live on main (GitHub raw URL accessible).
 *
 * Run:
 *   SOLANA_CLUSTER=devnet npx tsx scripts/update-token-uri.ts
 *
 * Prerequisites:
 *   - MACH_MINT_ADDRESS in env (from setup-mach-token.ts output)
 *   - Keypair at ~/.config/solana/id.json (or ANCHOR_WALLET) — must be update authority
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TOKEN_2022_PROGRAM_ID, createUpdateFieldInstruction } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const CLUSTER = process.env.SOLANA_CLUSTER ?? "devnet";

const NEW_METADATA_URI =
  "https://raw.githubusercontent.com/RustMunkey/maschina/main/assets/mach-token-metadata.json";

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
  const bytes = JSON.parse(fs.readFileSync(walletPath, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

async function main() {
  const mintAddress = process.env.MACH_MINT_ADDRESS;
  if (!mintAddress) {
    console.error("MACH_MINT_ADDRESS is required.");
    process.exit(1);
  }

  const connection = new Connection(getRpcUrl(), "confirmed");
  const authority = loadKeypair();
  const mint = new PublicKey(mintAddress);

  console.log(`Cluster:      ${CLUSTER}`);
  console.log(`Mint:         ${mintAddress}`);
  console.log(`Authority:    ${authority.publicKey.toBase58()}`);
  console.log(`New URI:      ${NEW_METADATA_URI}\n`);

  // Token-2022 TokenMetadata extension — metadata lives at the mint address itself.
  // updateField sets a single field by name; "uri" is the metadata URI.
  const ix = createUpdateFieldInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    metadata: mint,
    updateAuthority: authority.publicKey,
    field: "uri",
    value: NEW_METADATA_URI,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = authority.publicKey;

  console.log("Sending updateField transaction...");
  const sig = await sendAndConfirmTransaction(connection, tx, [authority], {
    commitment: "confirmed",
  });

  console.log("\nDone.");
  console.log(`  Signature: ${sig}`);
  console.log(`  New URI:   ${NEW_METADATA_URI}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
