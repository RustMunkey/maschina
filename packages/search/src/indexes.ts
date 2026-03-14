import { getMeili } from "./client.js";

// ─── Index names ───────────────────────────────────────────────────────────────

export const INDEXES = {
  agents: "agents",
  marketplace: "marketplace",
  docs: "docs",
  users: "users", // admin/internal search only
} as const;

export type IndexName = (typeof INDEXES)[keyof typeof INDEXES];

// ─── Index setup ──────────────────────────────────────────────────────────────

const INDEX_SETTINGS: Record<
  IndexName,
  Parameters<ReturnType<typeof getMeili>["index"]>["0"] extends string ? any : never
> = {
  agents: {
    searchableAttributes: ["name", "description", "type", "systemPrompt"],
    filterableAttributes: ["userId", "type", "status", "model", "createdAt"],
    sortableAttributes: ["createdAt", "name"],
    displayedAttributes: ["id", "name", "description", "type", "status", "model", "createdAt"],
  },
  marketplace: {
    searchableAttributes: ["name", "description", "tags", "author"],
    filterableAttributes: ["category", "price", "rating"],
    sortableAttributes: ["rating", "createdAt", "price"],
    displayedAttributes: ["id", "name", "description", "tags", "price", "rating", "author"],
  },
  docs: {
    searchableAttributes: ["title", "content", "section"],
    filterableAttributes: ["section", "version"],
    sortableAttributes: ["title"],
    displayedAttributes: ["id", "title", "section", "slug", "excerpt"],
  },
  users: {
    searchableAttributes: ["email", "name"],
    filterableAttributes: ["tier", "createdAt"],
    sortableAttributes: ["createdAt"],
    displayedAttributes: ["id", "email", "name", "tier", "createdAt"],
  },
};

/**
 * Ensure all Meilisearch indexes exist with correct settings.
 * Safe to call multiple times (idempotent).
 */
export async function ensureIndexes(): Promise<void> {
  const client = getMeili();

  for (const [name, settings] of Object.entries(INDEX_SETTINGS)) {
    try {
      await client.createIndex(name, { primaryKey: "id" });
    } catch (err: any) {
      // Index already exists — that's fine
      if (!err?.message?.includes("already exists")) throw err;
    }

    const index = client.index(name);
    await index.updateSettings(settings);
  }
}
