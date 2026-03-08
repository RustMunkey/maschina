# Scaling

---

## Horizontal Scaling

All backend services are stateless (state lives in PostgreSQL, Redis, or NATS) and can scale horizontally by adding instances.

| Service | Scaling axis | State |
|---|---|---|
| `services/gateway` | Horizontal — add instances behind load balancer | Stateless (rate limit state in Redis) |
| `services/api` | Horizontal — add instances | Stateless |
| `services/daemon` | Horizontal — add instances | Stateless (NATS distributes jobs) |
| `services/realtime` | Horizontal with care — see below | Per-user broadcast channels in memory |
| `services/runtime` | Horizontal — add instances | Stateless |

---

## Worker Scaling — services/daemon

The daemon is the agent execution engine. Scaling is driven by NATS consumer lag.

### Per-instance concurrency

Each daemon instance uses a semaphore to cap in-flight jobs:

```
MAX_CONCURRENCY=10   ← 10 parallel jobs per daemon instance
```

### Horizontal scaling

Multiple daemon instances pull from the same NATS `MASCHINA_JOBS` stream with the same durable consumer name. NATS distributes messages across all active instances — no coordination required.

```
NATS MASCHINA_JOBS stream
  ├── daemon-1 (10 concurrent jobs)
  ├── daemon-2 (10 concurrent jobs)
  └── daemon-n (10 concurrent jobs)
```

### Scale trigger

Scale out when: NATS consumer lag on `MASCHINA_JOBS` consistently > 50 messages.
Scale in when: consumer lag consistently = 0 and CPU < 20%.

---

## Queue Scaling — NATS JetStream

NATS JetStream scales by adding server nodes to the cluster.

| Phase | NATS topology |
|---|---|
| Phase 1 | Single NATS server (Docker, Fly.io single instance) |
| Phase 2 | 3-node NATS cluster with JetStream replication=2 |
| Phase 3 | NATS cluster in AWS VPC with EBS-backed storage |

Streams use `WorkQueue` retention for `MASCHINA_JOBS` — messages are deleted after ACK, preventing unbounded growth.

---

## Realtime Scaling — services/realtime

`services/realtime` keeps per-user broadcast channels in memory (`DashMap`). This means a user's WebSocket connection is sticky to a specific realtime instance.

### Phase 1 (single instance)

Single realtime instance — no stickiness problem.

### Phase 2+ (multiple instances)

When multiple realtime instances run, WebSocket connections must route to the instance that holds the user's channel. Two options:

**Option A — Sticky load balancing**: Route `userId` to a consistent instance via consistent hashing in the gateway. Simple, no backend change.

**Option B — NATS fan-out to all instances**: Each realtime instance subscribes to all NATS subjects and broadcasts only to local connections. Duplicate events are emitted by all instances but only the one with the live connection delivers to the client. Slightly wasteful but operationally simple.

Option A is preferred for Phase 2. Option B scales better for Phase 3.

---

## Database Scaling

### Phase 1 — Neon Serverless

Neon autoscales compute based on load. Connection pooling via PgBouncer is handled by Neon.

### Phase 2 — Neon + read replicas

Neon supports read replicas for analytics and reporting queries. Route read-heavy endpoints to the replica.

### Phase 3 — RDS or Neon at scale

- RDS PostgreSQL on `db.r7g.2xlarge` with Multi-AZ
- PgBouncer sidecar for connection pooling
- Or Neon continues at scale (evaluate at Series A)

---

## Cache Scaling — Redis

| Phase | Redis topology |
|---|---|
| Phase 1 | Single Redis instance (Fly.io managed or Upstash) |
| Phase 2 | Redis Sentinel (HA, automatic failover) |
| Phase 3 | ElastiCache Redis Cluster (sharded) |

Redis usage is low-variance — quota counters (`INCRBY`) are fast and small. Scaling Redis is not a bottleneck until > 50k concurrent users.

---

## Search Scaling — Meilisearch

| Phase | Topology |
|---|---|
| Phase 1 | Single Meilisearch instance (Fly.io) |
| Phase 2 | Meilisearch Cloud (managed, horizontal read replicas) |
| Phase 3 | Meilisearch Cloud or self-hosted with multi-node |

Search is read-heavy. Add read replicas before adding indexing capacity.

---

## Vector DB Scaling — Qdrant

| Phase | Topology |
|---|---|
| Phase 1 | Single Qdrant instance (Fly.io) |
| Phase 2 | Qdrant Cloud (managed cluster) |
| Phase 3 | Qdrant distributed cluster with sharding |

Qdrant collections are sharded automatically in cluster mode. No application code changes required when adding nodes.

---

## Scaling Characteristics Summary

| Component | Bottleneck | First action |
|---|---|---|
| Agent throughput | Daemon concurrency | Add daemon instances |
| API latency | DB query time | Add DB read replica |
| WebSocket connections | Realtime memory | Add realtime instances (sticky LB) |
| Job queue lag | Consumer throughput | Add daemon instances |
| Search latency | Meilisearch CPU | Upgrade to Meilisearch Cloud |
| LLM throughput | Anthropic API rate limits | Request rate limit increase |
| Storage | S3 (unlimited) | No action needed |
