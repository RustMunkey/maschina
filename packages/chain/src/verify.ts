// Wallet ownership verification via signed message.
//
// Flow:
//   1. API issues a challenge: GET /wallets/challenge?address=<pubkey>
//   2. User signs the challenge string with their wallet (Phantom, Backpack, etc.)
//   3. API verifies: POST /wallets/verify { address, signature, challenge }
//   4. On success, wallet_addresses.is_verified = true
//
// We use nacl (tweetnacl) for Ed25519 verification — same curve as Solana.

import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

const CHALLENGE_PREFIX = "Maschina wallet verification:\n";

/** Generate a deterministic challenge string for a given address + nonce. */
export function buildChallenge(address: string, nonce: string): string {
  return `${CHALLENGE_PREFIX}${address}\n${nonce}`;
}

/**
 * Verify a Phantom/Backpack wallet signature over a challenge string.
 *
 * @param address   Base58 Solana public key
 * @param signature Hex or base64 signature from wallet adapter
 * @param challenge The exact challenge string that was signed
 */
export function verifyWalletSignature(
  address: string,
  signatureHex: string,
  challenge: string,
): boolean {
  try {
    const pubkeyBytes = new PublicKey(address).toBytes();
    const sigBytes = hexToBytes(signatureHex);
    const msgBytes = new TextEncoder().encode(challenge);
    return nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
