/**
 * setup-devnet.ts
 *
 * Registers the Maschina settlement webhook with Helius on devnet.
 * Run after deploying the Anchor program and updating SETTLEMENT_PROGRAM_ID.
 *
 * Run:
 *   HELIUS_API_KEY=xxx SOLANA_CLUSTER=devnet npx tsx scripts/setup-devnet.ts
 *
 * What it does:
 *   1. Verifies the settlement program is deployed at SETTLEMENT_PROGRAM_ID
 *   2. Registers a Helius webhook for settlement events → API_BASE_URL/webhooks/helius
 *   3. Prints the webhook ID — save to .env as HELIUS_WEBHOOK_ID
 */

import { getCluster, getHeliusClient } from "@maschina/chain";
import { registerSettlementWebhook } from "@maschina/chain";
import { SETTLEMENT_PROGRAM_ID } from "@maschina/chain";

async function main() {
  const cluster = getCluster();

  if (cluster !== "devnet") {
    console.error("This script is for devnet only. Set SOLANA_CLUSTER=devnet");
    process.exit(1);
  }

  const apiBaseUrl = process.env.API_BASE_URL;
  if (!apiBaseUrl) {
    console.error(
      "API_BASE_URL is not set. Set it to your public API URL (e.g. https://api.maschina.ai)",
    );
    process.exit(1);
  }

  console.log(`Cluster:           ${cluster}`);
  console.log(`Settlement program: ${SETTLEMENT_PROGRAM_ID.toBase58()}`);
  console.log(`API base URL:       ${apiBaseUrl}`);

  const helius = getHeliusClient();
  const webhookUrl = `${apiBaseUrl}/webhooks/helius`;

  console.log(`\nRegistering Helius webhook → ${webhookUrl}`);

  const webhookId = await registerSettlementWebhook(helius, webhookUrl);

  console.log("\n✓ Webhook registered");
  console.log(`  Webhook ID: ${webhookId}`);
  console.log("\nAdd to .env:");
  console.log(`  HELIUS_WEBHOOK_ID=${webhookId}`);
  console.log("  HELIUS_WEBHOOK_SECRET=<generate a random secret for webhook auth>");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
