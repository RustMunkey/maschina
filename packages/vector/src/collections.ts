import { getQdrant } from "./client.js";

// ─── Collection names ─────────────────────────────────────────────────────────

export const COLLECTIONS = {
  /** Agent system prompts and descriptions — for semantic agent search */
  agentEmbeddings: "agent_embeddings",
  /** User-uploaded document chunks — for per-user RAG */
  documentChunks: "document_chunks",
  /** Marketplace listing embeddings — semantic marketplace search */
  marketplaceListings: "marketplace_listings",
  /** Per-agent episodic memory — retrieved at run time for context injection */
  agentMemory: "agent_memory",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

// Vector dimensions per collection
// voyage-3 = 1024, text-embedding-3-small = 1536, ada-002 = 1536
const VECTOR_SIZES: Record<string, number> = {
  agent_embeddings: 1536,
  document_chunks: 1536,
  marketplace_listings: 1536,
  agent_memory: 1024, // Voyage AI voyage-3
};

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
          size: VECTOR_SIZES[name] ?? 1536,
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
