// Wallet address validation for Solana.

import { PublicKey } from "@solana/web3.js";

/**
 * Returns true if `address` is a valid base58-encoded Solana public key.
 * Does not hit the network — purely local validation.
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalise a Solana address to its canonical base58 form.
 * Throws if the address is invalid.
 */
export function normaliseSolanaAddress(address: string): string {
  return new PublicKey(address).toBase58();
}

/**
 * Fetch the SOL balance (in lamports) for a given address.
 */
export async function getSolBalance(address: string): Promise<number> {
  const { getConnection } = await import("./connection.js");
  const conn = getConnection();
  return conn.getBalance(new PublicKey(address));
}
