import {
  buildChallenge,
  isValidSolanaAddress,
  normaliseSolanaAddress,
  verifyWalletSignature,
} from "@maschina/chain";
import { db, walletAddresses } from "@maschina/db";
import { and, eq } from "@maschina/db";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Variables } from "../context.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Variables: Variables }>();

// ─── GET /wallets/challenge ───────────────────────────────────────────────────
// Issues a sign challenge for a given Solana address.
// The client signs this with their wallet and submits via POST /wallets/verify.

app.get("/challenge", requireAuth, async (c) => {
  const address = c.req.query("address");
  if (!address || !isValidSolanaAddress(address)) {
    throw new HTTPException(400, { message: "Invalid or missing Solana address" });
  }

  const nonce = crypto.randomUUID();
  const challenge = buildChallenge(address, nonce);

  // Return the challenge — the nonce is embedded so we can reconstruct it
  // on verify. In production you'd store the nonce in Redis with a TTL.
  return c.json({ challenge, nonce });
});

// ─── POST /wallets ────────────────────────────────────────────────────────────
// Add a wallet address (unverified). Verification is a separate step.

const AddWalletSchema = z.object({
  address: z.string().min(32).max(44),
  network: z.enum(["solana_mainnet", "solana_devnet", "solana_testnet"]),
  label: z.string().max(50).optional(),
  isPrimary: z.boolean().default(false),
});

app.post("/", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = AddWalletSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  if (!isValidSolanaAddress(parsed.data.address)) {
    throw new HTTPException(400, { message: "Invalid Solana address" });
  }

  const address = normaliseSolanaAddress(parsed.data.address);

  // Prevent duplicates
  const [existing] = await db
    .select({ id: walletAddresses.id })
    .from(walletAddresses)
    .where(and(eq(walletAddresses.userId, userId), eq(walletAddresses.address, address)))
    .limit(1);

  if (existing) {
    throw new HTTPException(409, { message: "Wallet address already linked to this account" });
  }

  // If isPrimary, demote all existing primary wallets on this network
  if (parsed.data.isPrimary) {
    await db
      .update(walletAddresses)
      .set({ isPrimary: false })
      .where(
        and(
          eq(walletAddresses.userId, userId),
          eq(walletAddresses.network, parsed.data.network),
          eq(walletAddresses.isPrimary, true),
        ),
      );
  }

  const [wallet] = await db
    .insert(walletAddresses)
    .values({
      userId,
      address,
      network: parsed.data.network,
      label: parsed.data.label ?? null,
      isPrimary: parsed.data.isPrimary,
      isVerified: false,
    })
    .returning();

  return c.json(wallet, 201);
});

// ─── GET /wallets ─────────────────────────────────────────────────────────────

app.get("/", requireAuth, async (c) => {
  const { id: userId } = c.get("user");

  const rows = await db.select().from(walletAddresses).where(eq(walletAddresses.userId, userId));

  return c.json(rows);
});

// ─── POST /wallets/verify ─────────────────────────────────────────────────────
// Verify ownership of a wallet address via signed challenge.

const VerifyWalletSchema = z.object({
  address: z.string(),
  signature: z.string().regex(/^[0-9a-f]+$/i, "signature must be hex"),
  nonce: z.string().uuid(),
});

app.post("/verify", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parsed = VerifyWalletSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  if (!isValidSolanaAddress(parsed.data.address)) {
    throw new HTTPException(400, { message: "Invalid Solana address" });
  }

  const address = normaliseSolanaAddress(parsed.data.address);
  const challenge = buildChallenge(address, parsed.data.nonce);

  const valid = verifyWalletSignature(address, parsed.data.signature, challenge);
  if (!valid) {
    throw new HTTPException(400, { message: "Signature verification failed" });
  }

  const [wallet] = await db
    .update(walletAddresses)
    .set({ isVerified: true, verifiedAt: new Date() })
    .where(and(eq(walletAddresses.userId, userId), eq(walletAddresses.address, address)))
    .returning();

  if (!wallet) {
    throw new HTTPException(404, { message: "Wallet address not found — add it first" });
  }

  return c.json(wallet);
});

// ─── DELETE /wallets/:id ──────────────────────────────────────────────────────

app.delete("/:id", requireAuth, async (c) => {
  const { id: userId } = c.get("user");
  const walletId = c.req.param("id");

  const [existing] = await db
    .select({ id: walletAddresses.id })
    .from(walletAddresses)
    .where(and(eq(walletAddresses.id, walletId), eq(walletAddresses.userId, userId)))
    .limit(1);

  if (!existing) throw new HTTPException(404, { message: "Wallet not found" });

  await db.delete(walletAddresses).where(eq(walletAddresses.id, walletId));

  return c.json({ success: true });
});

export default app;
