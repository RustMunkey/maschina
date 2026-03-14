/**
 * Feature flag client with LaunchDarkly support and Redis caching.
 *
 * Priority:
 *   1. LaunchDarkly (if LAUNCHDARKLY_SDK_KEY is set)
 *   2. Redis cache (TTL 60s)
 *   3. Hard-coded defaults from flags.ts
 *
 * Usage:
 *   const flags = await getFlags({ userId: "u_123", tier: "m5" });
 *   if (flags.is("memoryEnabled")) { ... }
 */

import { FLAGS, type FlagName } from "./flags.js";
import type { FlagContext } from "./types.js";

const CACHE_TTL_SECONDS = 60;

// ── LaunchDarkly (optional, lazy-loaded) ─────────────────────────────────

type LdClient = { variation: (key: string, ctx: unknown, def: boolean) => boolean };

let _ld: LdClient | null = null;
let _ldInitialised = false;

async function getLdClient(): Promise<LdClient | null> {
  if (_ldInitialised) return _ld;
  _ldInitialised = true;

  const sdkKey = process.env.LAUNCHDARKLY_SDK_KEY;
  if (!sdkKey) return null;

  try {
    const { init } = await import("@launchdarkly/node-server-sdk");
    const client = init(sdkKey, { diagnosticOptOut: true });
    await client.waitForInitialization({ timeout: 5 });
    _ld = client as unknown as LdClient;
  } catch {
    _ld = null;
  }
  return _ld;
}

// ── Redis cache (optional, lazy-loaded) ───────────────────────────────────

type SimpleCache = {
  get: (k: string) => Promise<string | null>;
  setex: (k: string, ttl: number, v: string) => Promise<unknown>;
};

let _cache: SimpleCache | null = null;
let _cacheInitialised = false;

async function getCacheClient(): Promise<SimpleCache | null> {
  if (_cacheInitialised) return _cache;
  _cacheInitialised = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    const { Redis } = await import("ioredis");
    _cache = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
    }) as unknown as SimpleCache;
  } catch {
    _cache = null;
  }
  return _cache;
}

// ── Flag resolver ─────────────────────────────────────────────────────────

export class FlagClient {
  private readonly values: Map<FlagName, boolean>;

  constructor(values: Map<FlagName, boolean>) {
    this.values = values;
  }

  is(flag: FlagName): boolean {
    return this.values.get(flag) ?? FLAGS[flag].defaultValue;
  }

  all(): Record<FlagName, boolean> {
    const result = {} as Record<FlagName, boolean>;
    for (const key of Object.keys(FLAGS) as FlagName[]) {
      result[key] = this.is(key);
    }
    return result;
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Resolve all flags for a given context.
 * Reads from LaunchDarkly if available, otherwise returns defaults.
 */
export async function getFlags(ctx: FlagContext = {}): Promise<FlagClient> {
  const cacheKey = `flags:${ctx.userId ?? "anon"}:${ctx.tier ?? ""}`;
  const cache = await getCacheClient();

  // Try cache first
  if (cache) {
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as Record<string, boolean>;
        return new FlagClient(new Map(Object.entries(parsed) as [FlagName, boolean][]));
      }
    } catch {
      // cache miss — continue
    }
  }

  const ld = await getLdClient();
  const values = new Map<FlagName, boolean>();

  for (const [name, def] of Object.entries(FLAGS) as [FlagName, { defaultValue: boolean }][]) {
    if (ld) {
      const ldCtx = {
        kind: "multi",
        ...(ctx.userId
          ? {
              user: {
                key: ctx.userId,
                email: ctx.email,
                custom: { tier: ctx.tier, ...ctx.attributes },
              },
            }
          : {}),
        ...(ctx.orgId ? { organization: { key: ctx.orgId } } : {}),
      };
      values.set(name, ld.variation(name, ldCtx, def.defaultValue));
    } else {
      values.set(name, def.defaultValue);
    }
  }

  // Write to cache
  if (cache) {
    try {
      await cache.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(Object.fromEntries(values)));
    } catch {
      // non-fatal
    }
  }

  return new FlagClient(values);
}

/**
 * Evaluate a single flag without full resolution. Useful in hot paths.
 */
export async function isEnabled(flag: FlagName, ctx: FlagContext = {}): Promise<boolean> {
  const client = await getFlags(ctx);
  return client.is(flag);
}
