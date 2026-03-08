import { getQdrant } from "./client.js";

// ─── Collection names ─────────────────────────────────────────────────────────

export const COLLECTIONS = {
  /** Agent system prompts and descriptions — for semantic agent search */
  agentEmbeddings:    "agent_embeddings",
  /** User-uploaded document chunks — for per-user RAG */
  documentChunks:     "document_chunks",
  /** Marketplace listing embeddings — semantic marketplace search */
  marketplaceListings: "marketplace_listings",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

// Vector dimensions for each collection
// text-embedding-3-small = 1536, Claude embeddings = 1024, ada-002 = 1536
const DEFAULT_VECTOR_SIZE = 1536;

/**
 * Ensure all Qdrant collections exist with correct configuration.
 * Safe to call multiple times (idempotent).
 */
export async function ensureCollections(): Promise<void> {
  const client = getQdrant();

  for (const name of Object.values(COLLECTIONS)) {
    try {
      await client.getCollection(name);
      // Collection exists — skip creation
    } catch {
      await client.createCollection(name, {
        vectors: {
          size:     DEFAULT_VECTOR_SIZE,
          distance: "Cosine",
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      });
    }
  }
}
