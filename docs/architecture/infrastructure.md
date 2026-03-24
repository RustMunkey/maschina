# Infrastructure Architecture


---

## Containerization

Every service runs in a Docker container. Images are built from service-level Dockerfiles using multi-stage builds to minimize final image size.

### Build strategy

| Service | Base image | Final image | Approx size |
|---|---|---|---|
| `services/gateway` | `rust:1.82-slim` | `debian:bookworm-slim` | ~12 MB |
| `services/daemon` | `rust:1.82-slim` | `debian:bookworm-slim` | ~14 MB |
| `services/realtime` | `rust:1.82-slim` | `debian:bookworm-slim` | ~10 MB |
| `services/api` | `node:22-slim` | `node:22-slim` | ~180 MB |
| `services/runtime` | `python:3.12-slim` | `python:3.12-slim` | ~320 MB |

Rust binaries are compiled in a builder stage and copied to a minimal Debian image. This yields small, secure images with no compiler toolchain at runtime.

---

## Local Development Environment

The full local stack runs via Docker Compose:

```bash
pnpm docker:up    # starts all infrastructure services
pnpm docker:dev   # starts infra + dev overrides
pnpm docker:down  # stop
pnpm docker:reset # stop + delete volumes (fresh state)
```

### Services in Docker Compose

| Service | Image | Port | Purpose |
|---|---|---|---|
| PostgreSQL | `postgres:17-alpine` | 5432 | Primary database |
| Redis | `redis:7-alpine` | 6379 | Cache + sessions |
| NATS | `nats:2.10-alpine` | 4222 / 8222 | Messaging (JetStream + monitor) |
| Meilisearch | `getmeili/meilisearch:v1.11` | 7700 | Full-text search |
| Qdrant | `qdrant/qdrant:v1.12` | 6333 / 6334 | Vector database |
| Temporal | `temporalio/auto-setup:1.24` | 7233 | Workflow server |
| Temporal UI | `temporalio/ui:2.26` | 8088 | Workflow dashboard |

Application services (`services/api`, `services/daemon`, etc.) run directly on the host during development for fast iteration.

---

## Hosting

### Phase 1 — Fly.io (current)

All backend services deploy to Fly.io using `fly deploy` per service. Each service has a `fly.toml` defining resources, secrets, and health checks.

| Service | Machine type | Memory | Notes |
|---|---|---|---|
| `maschina-gateway` | `shared-cpu-2x` | 512 MB | Public edge — handles all inbound traffic |
| `maschina-api` | `shared-cpu-2x` | 512 MB | Business logic |
| `maschina-realtime` | `shared-cpu-4x` | 1 GB | WebSocket — high connection count |
| `maschina-daemon` | `performance-2x` | 2 GB | CPU-bound orchestration |
| `maschina-runtime` | `performance-4x` | 4 GB | LLM inference — CPU-intensive |

Services communicate over Fly's private network (6PN) using `.internal` DNS. Only `maschina-gateway` has a public IP.

#### Deploy a service

```bash
cd services/gateway
fly deploy
```

#### Set secrets

```bash
fly secrets set JWT_SECRET=... --app maschina-gateway
fly secrets set API_URL=http://maschina-api.internal:3000 --app maschina-gateway
```

### Phase 2 — Fly.io + Kubernetes

Kubernetes workloads for stateful services (daemon, runtime) as traffic scales. Fly Machines continue handling stateless edge services.

### Phase 3 — AWS ECS / EKS

Full migration to AWS for co-location with S3, CloudFront, and RDS. Gateway moves to Cloudflare Workers or AWS ALB.

---

## Runtime Services (managed)

| Service | Provider | Purpose |
|---|---|---|
| PostgreSQL | Neon (serverless) | Branch-per-PR previews, auto-scaling |
| Redis | Upstash (serverless) | Zero-ops cache, pay-per-request |
| Qdrant | Qdrant Cloud | Managed vector database |
| Meilisearch | Meilisearch Cloud | Managed search |
| Temporal | Self-hosted on Fly.io | Workflow server (SQLite in Phase 1) |
| S3 | AWS | Object storage — all phases |
| CDN | AWS CloudFront | Static assets and public files |

---

## Scaling Characteristics

| Service | Scaling axis | Bottleneck |
|---|---|---|
| gateway | Horizontal (stateless) | Network throughput |
| api | Horizontal (stateless) | DB connection pool |
| realtime | Horizontal (per-user affinity preferred) | Memory (connections) |
| daemon | Horizontal (NATS consumer groups) | `MAX_CONCURRENT_AGENTS` per instance |
| runtime | Horizontal | LLM API rate limits |
