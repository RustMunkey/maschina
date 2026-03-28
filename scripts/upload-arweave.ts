/**
 * upload-arweave.ts
 *
 * Uploads the MACH token image and metadata JSON to Arweave via Irys.
 * Prints the metadata URI to paste into setup-mach-token.ts.
 *
 * Run:
 *   SOLANA_CLUSTER=devnet npx tsx scripts/upload-arweave.ts
 *
 * Prerequisites:
 *   - pnpm add -D @irys/sdk
 *   - Keypair at ~/.config/solana/id.json (or ANCHOR_WALLET)
 *   - Devnet: funded automatically via airdrop
 *   - Mainnet: wallet needs real SOL (upload costs ~$0.01 total)
 *
 * Output:
 *   Image URI  — paste into assets/mach-token-metadata.json
 *   Metadata URI — paste into scripts/setup-mach-token.ts uri field
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Irys from "@irys/sdk";

const CLUSTER = process.env.SOLANA_CLUSTER ?? "devnet";

const ASSETS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "assets");
const IMAGE_PATH = path.join(ASSETS_DIR, "mach-token.png");
const METADATA_PATH = path.join(ASSETS_DIR, "mach-token-metadata.json");

function getIrysUrl(): string {
  return CLUSTER === "mainnet-beta" ? "https://node1.irys.xyz" : "https://devnet.irys.xyz";
}

function getRpcUrl(): string {
  if (CLUSTER === "localnet") {
    console.error("Arweave uploads are not supported on localnet. Use devnet or mainnet-beta.");
    process.exit(1);
  }
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

function loadKeypairPath(): string {
  return process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json");
}

async function main() {
  console.log(`Cluster: ${CLUSTER}`);
  console.log(`Irys node: ${getIrysUrl()}\n`);

  if (!fs.existsSync(IMAGE_PATH)) {
    console.error(`Image not found: ${IMAGE_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(METADATA_PATH)) {
    console.error(`Metadata not found: ${METADATA_PATH}`);
    process.exit(1);
  }

  const keypairPath = loadKeypairPath();
  const keypairBytes = JSON.parse(fs.readFileSync(keypairPath, "utf-8")) as number[];
  const secretKey = Uint8Array.from(keypairBytes);

  const irys = new Irys({
    url: getIrysUrl(),
    token: "solana",
    key: secretKey,
    config: { providerUrl: getRpcUrl() },
  });

  // Fund if on devnet (devnet Irys will airdrop automatically)
  if (CLUSTER !== "mainnet-beta") {
    console.log("Funding Irys node (devnet)...");
    try {
      await irys.fund(irys.utils.toAtomic(0.05));
      console.log("  Funded 0.05 SOL\n");
    } catch {
      // May already be funded — continue
      console.log("  Already funded or airdrop pending — continuing\n");
    }
  }

  // ── Upload image ─────────────────────────────────────────────────────────────
  console.log("Uploading mach-token.png...");
  const imageData = fs.readFileSync(IMAGE_PATH);
  const imageReceipt = await irys.upload(imageData, {
    tags: [
      { name: "Content-Type", value: "image/png" },
      { name: "App-Name", value: "Maschina" },
    ],
  });
  const imageUri = `https://arweave.net/${imageReceipt.id}`;
  console.log(`  Image URI: ${imageUri}\n`);

  // ── Patch metadata with real image URI ───────────────────────────────────────
  const metadataRaw = fs.readFileSync(METADATA_PATH, "utf-8");
  const metadata = JSON.parse(metadataRaw);
  metadata.image = imageUri;
  metadata.properties.files[0].uri = imageUri;
  const metadataPatched = JSON.stringify(metadata, null, 2);

  // ── Upload metadata ──────────────────────────────────────────────────────────
  console.log("Uploading mach-token-metadata.json...");
  const metaReceipt = await irys.upload(Buffer.from(metadataPatched, "utf-8"), {
    tags: [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "Maschina" },
    ],
  });
  const metadataUri = `https://arweave.net/${metaReceipt.id}`;
  console.log(`  Metadata URI: ${metadataUri}\n`);

  // ── Write patched metadata back to disk ──────────────────────────────────────
  fs.writeFileSync(METADATA_PATH, metadataPatched);
  console.log("  Updated assets/mach-token-metadata.json with real image URI\n");

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("─────────────────────────────────────────────");
  console.log("Next steps:");
  console.log("  1. In scripts/setup-mach-token.ts, set:");
  console.log(`     uri: "${metadataUri}",`);
  console.log("  2. Run: SOLANA_CLUSTER=devnet npx tsx scripts/setup-mach-token.ts");
  console.log("─────────────────────────────────────────────");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
