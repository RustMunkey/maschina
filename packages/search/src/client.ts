import { MeiliSearch } from "meilisearch";

let _client: MeiliSearch | null = null;

export function getMeili(): MeiliSearch {
  if (!_client) {
    _client = new MeiliSearch({
      host: process.env["MEILISEARCH_URL"] ?? "http://localhost:7700",
      apiKey: process.env["MEILISEARCH_MASTER_KEY"] ?? "masterkey-change-in-production",
    });
  }
  return _client;
}
