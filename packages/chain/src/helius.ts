// @maschina/chain — Helius client
//
// Helius is our Solana RPC + indexing layer:
//   - Enhanced transaction parsing (human-readable instead of raw instruction logs)
//   - Webhooks for on-chain event delivery (settlement, stake deposits)
//   - DAS API for token/NFT metadata when needed
//
// env: HELIUS_API_KEY (required in production; falls back to mainnet public RPC in dev)

import { Helius } from "helius-sdk";

let _client: Helius | null = null;

export function getHeliusClient(): Helius {
  if (_client) return _client;
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error("HELIUS_API_KEY is not set");
  }
  _client = new Helius(apiKey);
  return _client;
}

/** Solana cluster derived from the Helius API key's target network. */
export type SolanaCluster = "mainnet-beta" | "devnet";

export function getCluster(): SolanaCluster {
  const cluster = process.env.SOLANA_CLUSTER ?? "devnet";
  if (cluster !== "mainnet-beta" && cluster !== "devnet") {
    throw new Error(`Invalid SOLANA_CLUSTER: ${cluster}. Must be "mainnet-beta" or "devnet".`);
  }
  return cluster;
}

/** Helius RPC URL for use with @solana/web3.js Connection. */
export function getHeliusRpcUrl(): string {
  const apiKey = process.env.HELIUS_API_KEY;
  const cluster = getCluster();
  if (!apiKey) {
    // Local dev fallback — no Helius key required
    return cluster === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com";
  }
  return cluster === "mainnet-beta"
    ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
    : `https://devnet.helius-rpc.com/?api-key=${apiKey}`;
}
