import Redis, { type Redis as RedisType } from "ioredis";

let _client: RedisType | null = null;

export function getRedis(): RedisType {
  if (_client) return _client;

  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";

  const client = new (Redis as any)(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times: number) => Math.min(times * 100, 10_000),
  }) as RedisType;

  client.on("error", (err: Error) => {
    console.error("[cache] Redis error:", err.message);
  });

  client.on("connect", () => {
    console.log("[cache] Redis connected");
  });

  _client = client;
  return client;
}

/** Call on graceful shutdown to close the connection cleanly. */
export async function closeRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}
