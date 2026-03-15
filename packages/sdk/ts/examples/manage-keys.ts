/**
 * Maschina TypeScript SDK — API key lifecycle
 *
 * Creates a key, lists all keys, then revokes the new one.
 *
 * Prerequisites:
 *   export MASCHINA_API_KEY=msk_...
 *   npx tsx examples/manage-keys.ts
 */

import { MaschinaClient } from "../src/index.js";

const client = new MaschinaClient({
  apiKey:
    process.env.MASCHINA_API_KEY ??
    (() => {
      throw new Error("MASCHINA_API_KEY is not set");
    })(),
});

// Create a key with 30-day expiry
const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const created = await client.createKey({ name: "Example key", expiresAt: expiry });

// The raw key is only available here — save it immediately
console.log("New API key (save this — shown once only):");
console.log(created.key);
console.log(`Prefix: ${created.keyPrefix}`);
console.log(`Expires: ${created.expiresAt}`);

// List all keys
const keys = await client.listKeys();
console.log(`\nAll keys (${keys.length} total):`);
for (const k of keys) {
  const lastUsed = k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "never";
  console.log(`  ${k.keyPrefix}…  ${k.name}  last used: ${lastUsed}`);
}

// Revoke the key we just created
await client.revokeKey(created.id);
console.log(`\nRevoked key: ${created.keyPrefix}…`);
