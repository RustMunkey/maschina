import { getQdrant } from "./client.js";
import type { CollectionName } from "./collections.js";

export interface VectorPoint {
  /** Stable UUID for this point — used for upsert/delete */
  id: string;
  /** Embedding vector */
  vector: number[];
  /** Arbitrary metadata stored alongside the vector */
  payload: Record<string, unknown>;
}

export interface SearchOptions {
  /** Number of nearest neighbors to return (default: 10) */
  limit?: number;
  /** Qdrant filter — e.g. `{ must: [{ key: "userId", match: { value: "abc" } }] }` */
  filter?: Record<string, unknown>;
  /** Minimum similarity score threshold (0–1 for Cosine) */
  scoreThreshold?: number;
  /** Whether to include payload in results (default: true) */
  withPayload?: boolean;
}

export interface SearchHit<P = Record<string, unknown>> {
  id: string;
  score: number;
  payload: P;
}

/**
 * Upsert a single vector point into a collection.
 */
export async function upsertVector(collection: CollectionName, point: VectorPoint): Promise<void> {
  await upsertVectors(collection, [point]);
}

/**
 * Bulk upsert vector points (efficient for batch indexing).
 */
export async function upsertVectors(
  collection: CollectionName,
  points: VectorPoint[],
): Promise<void> {
  if (points.length === 0) return;

  const qdrantPoints = points.map((p) => ({
    id: p.id,
    vector: p.vector,
    payload: p.payload,
  }));

  await getQdrant().upsert(collection, { points: qdrantPoints, wait: true });
}

/**
 * Semantic search — find the nearest neighbors to a query vector.
 */
export async function searchVectors<P = Record<string, unknown>>(
  collection: CollectionName,
  queryVector: number[],
  opts: SearchOptions = {},
): Promise<SearchHit<P>[]> {
  const results = await getQdrant().search(collection, {
    vector: queryVector,
    limit: opts.limit ?? 10,
    filter: opts.filter as any,
    score_threshold: opts.scoreThreshold,
    with_payload: opts.withPayload ?? true,
  });

  return results.map((r) => ({
    id: String(r.id),
    score: r.score,
    payload: (r.payload ?? {}) as P,
  }));
}

/**
 * Delete a vector point by ID.
 */
export async function deleteVector(collection: CollectionName, id: string): Promise<void> {
  await getQdrant().delete(collection, {
    points: [id],
    wait: true,
  });
}

/**
 * Delete all points matching a filter (e.g., all vectors for a user).
 */
export async function deleteVectorsByFilter(
  collection: CollectionName,
  filter: Record<string, unknown>,
): Promise<void> {
  await getQdrant().delete(collection, {
    filter: filter as any,
    wait: true,
  });
}
