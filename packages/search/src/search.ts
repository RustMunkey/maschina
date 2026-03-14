import type { SearchResponse } from "meilisearch";
import { getMeili } from "./client.js";
import type { IndexName } from "./indexes.js";

export interface SearchOptions {
  /** Max results to return (default: 20) */
  limit?: number;
  /** Pagination offset (default: 0) */
  offset?: number;
  /** Meilisearch filter expression e.g. `"userId = 'abc'"` */
  filter?: string;
  /** Fields to sort by e.g. `["createdAt:desc"]` */
  sort?: string[];
}

export interface SearchResult<T = Record<string, unknown>> {
  hits: T[];
  total: number;
  query: string;
  processingTimeMs: number;
}

/**
 * Search a named index and return typed results.
 */
export async function search<T extends Record<string, unknown> = Record<string, unknown>>(
  index: IndexName,
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult<T>> {
  const client = getMeili();
  const idx = client.index(index);

  const resp: SearchResponse<T> = await idx.search<T>(query, {
    limit: opts.limit ?? 20,
    offset: opts.offset ?? 0,
    filter: opts.filter,
    sort: opts.sort,
  });

  return {
    hits: resp.hits,
    total: resp.estimatedTotalHits ?? resp.hits.length,
    query: resp.query,
    processingTimeMs: resp.processingTimeMs,
  };
}

/**
 * Add or replace a single document in an index.
 */
export async function upsertDocument(
  index: IndexName,
  doc: Record<string, unknown> & { id: string },
): Promise<void> {
  await getMeili().index(index).addDocuments([doc]);
}

/**
 * Bulk upsert documents (efficient for large batches).
 */
export async function upsertDocuments(
  index: IndexName,
  docs: Array<Record<string, unknown> & { id: string }>,
): Promise<void> {
  if (docs.length === 0) return;
  await getMeili().index(index).addDocuments(docs);
}

/**
 * Remove a document from an index by ID.
 */
export async function deleteDocument(index: IndexName, id: string): Promise<void> {
  await getMeili().index(index).deleteDocument(id);
}
