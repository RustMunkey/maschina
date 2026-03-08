# Data Architecture

---

## Overview

Maschina uses a layered data strategy — relational data in PostgreSQL, fast ephemeral counters in Redis, full-text search in Meilisearch, and vector embeddings in both pgvector (collocated, simple) and Qdrant (scale, ANN).

| Layer | Technology | Purpose |
|---|---|---|
| Relational | PostgreSQL (Neon / SQLite) | Primary source of truth |
| Cache | Redis | Quota counters, rate state, session store |
| Search | Meilisearch | Full-text search across agents, marketplace, docs |
| Vector | pgvector | Lightweight per-user embedding lookup |
| Vector (scale) | Qdrant | ANN search, RAG pipelines, multi-collection |

---

## Relational Database

### Technology

| Environment | Database | Driver |
|---|---|---|
| Production | PostgreSQL on Neon (serverless) | postgres.js |
| Local development | SQLite (`file:./local.db`) | better-sqlite3 |
| Preview / CI | Neon branch (per PR) | postgres.js |

Dialect is auto-detected at runtime from `DATABASE_URL`:
- `file:` prefix → SQLite
- anything else → PostgreSQL

### ORM

**Drizzle ORM** with dual-dialect support. Schemas are defined once in `packages/database/src/schema/`; Drizzle generates dialect-specific SQL.

```
packages/database/
  src/
    schema/          ← table definitions (shared across dialects)
    migrations/      ← drizzle-kit generated SQL
    index.ts         ← exports db client + all schema tables
```

### Schema Overview

| Table | Description |
|---|---|
| `users` | Accounts — email, password hash, verification status, plan |
| `sessions` | Active sessions — token hash, expiry, device metadata |
| `api_keys` | Issued API keys — prefix, hash, last used |
| `agents` | Agent definitions — system prompt, model, config |
| `agent_runs` | Run history — status, input, output, token counts, timing |
| `usage_events` | Per-run billing events — tokens, cost, timestamp |
| `subscriptions` | Stripe subscriptions — plan tier, status, Stripe IDs |
| `credits` | Prepaid credit balance per user |
| `credit_transactions` | Credit top-ups and deductions |
| `notifications` | In-app notifications |
| `webhooks` | Registered outbound webhooks (developer-facing) |
| `webhook_deliveries` | Delivery log — status, retries, response |
| `wallet_addresses` | On-chain Solana wallet per user |
| `reputation_scores` | Staked USDC, on-chain address, computed score |
| `feature_flags` | Platform-wide feature gates |
| `feature_flag_overrides` | Per-user overrides (internal team) |

### Migrations

```bash
pnpm db:generate    # generate new migration from schema diff
pnpm db:migrate     # apply pending migrations
pnpm db:push        # push schema directly (dev only, no migration file)
```

Migrations run as part of the deployment pipeline before services start.

---

## Caching — Redis

Redis handles all ephemeral, high-frequency counters and state that must be fast and atomic.

### Use Cases

| Key Pattern | Type | Purpose |
|---|---|---|
| `quota:{userId}:{period}` | String | Monthly token usage counter (`INCRBY`) |
| `ratelimit:{ip}` | String | Per-IP request count |
| `ratelimit:{userId}` | String | Per-user request count |
| `session:{token}` | Hash | Session data cache |
| `credits:{userId}` | String | Cached credit balance |

### Client

`packages/cache` — thin wrapper around `ioredis` with connection pooling and typed key helpers.

---

## Search — Meilisearch

### Indexes

| Index | Documents | Searchable Fields | Filters |
|---|---|---|---|
| `agents` | Agent definitions | name, description, systemPrompt | userId, planTier, status |
| `marketplace` | Public marketplace listings | name, description, tags, category | category, tags, rating |
| `docs` | Documentation pages | title, content, section | section |
| `users` | User profiles (internal) | displayName, email | plan, verified |

### Client

`packages/search` — typed wrapper around the Meilisearch JS client.

```typescript
import { search, upsertDocument, deleteDocument } from "@maschina/search";

// Search agents
const results = await search<Agent>("agents", "data pipeline", {
  filters: `userId = "${userId}"`,
  limit: 10,
});

// Index on mutation
await upsertDocument("agents", { id: agent.id, name: agent.name, ... });
```

Updates are triggered from `services/api` route handlers on create/update/delete mutations.

---

## Vector Storage

### pgvector — Collocated Embeddings

For simple per-user embedding lookup (e.g., user's own agent memory, lightweight semantic search). Runs in the same PostgreSQL instance — no extra infrastructure.

```sql
CREATE TABLE agent_memory (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES agents(id),
  embedding VECTOR(1536),
  content TEXT,
  created_at TIMESTAMPTZ
);
CREATE INDEX ON agent_memory USING hnsw (embedding vector_cosine_ops);
```

### Qdrant — Dedicated Vector DB

For ANN search at scale, RAG pipelines, and multi-collection semantic search.

| Collection | Dimensions | Distance | Purpose |
|---|---|---|---|
| `agent_embeddings` | 1536 | Cosine | Per-agent memory and context |
| `document_chunks` | 1536 | Cosine | Documentation RAG |
| `marketplace_listings` | 1536 | Cosine | Semantic marketplace search |

**When to use each:**

- Use **pgvector** for small, per-user lookups where simplicity matters more than throughput
- Use **Qdrant** when you need ANN indexing at scale, rich metadata filtering, or multi-collection search

### Client

`packages/vector` — typed wrapper around `@qdrant/js-client-rest`.

```typescript
import { searchVectors, upsertVectors } from "@maschina/vector";

const hits = await searchVectors<AgentMemory>("agent_embeddings", embedding, {
  limit: 5,
  filter: { must: [{ key: "agent_id", match: { value: agentId } }] },
});
```

---

## Data Flow

### Write path (agent run)

```
services/api
  │  INSERT agent_runs (status: queued)
  │  INCRBY quota:{userId}:{period}   ← Redis
  │  Publish AgentExecuteJob          ← NATS
  ▼
services/daemon
  │  UPDATE agent_runs (status: running)
  │  POST /run → services/runtime
  │  UPDATE agent_runs (status: completed, output, tokens)
  │  INSERT usage_events
  │  Publish AgentRunCompleted        ← NATS
```

### Read path (agent list)

```
Client → GET /agents
  services/api → SELECT FROM agents WHERE userId = ?
  Response: paginated agent list
```

### Search index update

```
services/api mutation handler
  │  DB write (Drizzle)
  └─ upsertDocument(@maschina/search) ← async, non-blocking
```

---

## Backup and Retention

| Data | Backup | Retention |
|---|---|---|
| PostgreSQL (Neon) | Continuous WAL + daily snapshots | 7-day point-in-time recovery |
| Redis | AOF persistence (local), managed snapshots (prod) | 24h |
| Meilisearch | Index dumps on schedule | 3 daily snapshots |
| Qdrant | Snapshot API on schedule | 3 daily snapshots |
| S3 artifacts | Versioned bucket | Lifecycle: 90d active, Glacier after |
