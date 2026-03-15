import { bigint, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agentRuns, agents } from "./agents.js";
import { nodes } from "./nodes.js";
import { users } from "./users.js";

/**
 * Proof of Compute — cryptographically signed execution receipts.
 *
 * Issued by the daemon after every successful agent run.
 * Signature = HMAC-SHA256(canonicalPayload, PROOF_SECRET).
 * Verifiable by any party with the secret; future Solana integration
 * will anchor the receipt hash on-chain.
 */
export const executionReceipts = pgTable("execution_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),

  runId: uuid("run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  /** Node that executed the run (null = local runtime fallback) */
  nodeId: uuid("node_id").references(() => nodes.id, { onDelete: "set null" }),

  model: text("model").notNull(),
  inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
  outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),

  /** The exact JSON payload that was signed */
  payload: jsonb("payload").notNull(),
  /** HMAC-SHA256 hex digest of the canonical payload (legacy shared-secret signing) */
  signature: text("signature").notNull(),

  /**
   * Ed25519 signature from the node's keypair (hex-encoded).
   * Null for runs executed by the local runtime fallback (no node keypair).
   * When present, verifiable using nodes.publicKey — no shared secret required.
   * Phase 5: this signature is anchored on-chain via Solana.
   */
  nodeSignature: text("node_signature"),

  /**
   * Signing algorithm used for nodeSignature.
   * "ed25519" once the node binary ships; null until then.
   */
  signingAlg: text("signing_alg"),

  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});
