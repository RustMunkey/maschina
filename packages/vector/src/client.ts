import { QdrantClient } from "@qdrant/js-client-rest";

let _client: QdrantClient | null = null;

export function getQdrant(): QdrantClient {
  if (!_client) {
    _client = new QdrantClient({
      url: process.env["QDRANT_URL"] ?? "http://localhost:6333",
      apiKey: process.env["QDRANT_API_KEY"], // undefined for local dev (no auth)
    });
  }
  return _client;
}
