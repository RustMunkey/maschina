# Maschina

Infrastructure for autonomous digital labor. A modular platform for deploying networks of AI agents that continuously discover, evaluate, and execute digital opportunities.

> **Status:** Active development. v1.0.0 published.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend / tooling | TypeScript, React 19, Vite, TanStack Router |
| Backend API | TypeScript (Hono) |
| Agent runtime | Python (FastAPI) |
| ML / RL | Python (PyTorch, NumPy) |
| Daemon / Gateway / Realtime / CLI / Desktop | Rust (Tokio, Axum, Clap, Tauri 2) |
| Mobile | iOS: Swift + SwiftUI · Android: Kotlin + Jetpack Compose |
| Database | PostgreSQL (Neon prod) / SQLite (local dev) via Drizzle |
| Job queue | NATS JetStream |
| Cache | Redis (quota counters) |
| Monorepo | pnpm + Turborepo |
| Formatting / Linting | Biome (TS), Clippy (Rust), Ruff (Python) |
| Testing | Vitest (TS), cargo test (Rust), pytest (Python) |

---

## Prerequisites

- [Node.js](https://nodejs.org) >= 22
- [pnpm](https://pnpm.io) >= 10 — `npm install -g pnpm`
- [Rust](https://rustup.rs) 1.88+ toolchain
- [Python](https://python.org) >= 3.12 + [uv](https://github.com/astral-sh/uv)
- [Docker](https://docker.com) (for Postgres, Redis, NATS, and other infrastructure)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) (for desktop app)

---

## Setup

```sh
# 1. Clone
git clone git@github.com:RustMunkey/maschina.git
cd maschina

# 2. Install JS dependencies
pnpm install

# 3. Install git hooks (pre-commit lint + commit-msg format check)
pnpm hooks:install

# 4. Install Python dependencies
uv pip install -e packages/runtime -e packages/agents \
               -e packages/risk -e packages/sdk/python \
               -e services/runtime -e services/worker

# 5. Copy env files and configure
cp services/api/.env.example services/api/.env
cp services/gateway/.env.example services/gateway/.env
cp services/daemon/.env.example services/daemon/.env
cp services/realtime/.env.example services/realtime/.env
cp services/runtime/.env.example services/runtime/.env

# 6. Start infrastructure (Postgres, Redis, NATS, Meilisearch, Qdrant, Temporal, Grafana...)
pnpm docker:dev

# 7. Run DB migrations
pnpm db:migrate
```

---

## Commands

Everything runs from root via `pnpm`. No Makefiles, no exceptions.
Native tools (`cargo`, `pytest`, etc.) still work as normal — pnpm commands are convenience wrappers on top.

### Global

| Command | Description |
|---------|-------------|
| `pnpm build` | Build everything |
| `pnpm dev` | Dev all services in parallel |
| `pnpm test` | Run all tests (TS + Rust + Python) |
| `pnpm check` | Biome lint + format check (TypeScript / JSON) |
| `pnpm format` | Biome format with auto-fix |
| `pnpm clean` | Clean all build outputs |

### Start a process (dev mode)

| Command | Description |
|---------|-------------|
| `pnpm app` | Main product dashboard |
| `pnpm web` | Marketing site |
| `pnpm doc` | Documentation site |
| `pnpm console` | Internal admin console |
| `pnpm desktop` | Tauri desktop app |
| `pnpm api` | Backend API (Hono) |
| `pnpm daemon` | Rust agent orchestrator |
| `pnpm gateway` | Rust API gateway |
| `pnpm realtime` | Rust WebSocket/SSE hub |
| `pnpm worker` | Python NATS worker |
| `pnpm cli` | Maschina CLI (dev mode) |
| `pnpm code` | Maschina Code tool (dev mode) |

### Build

| Command | Description |
|---------|-------------|
| `pnpm build:api` | Build backend API |
| `pnpm build:daemon` | Build Rust daemon |
| `pnpm build:cli` | Build Maschina CLI |
| `pnpm build:packages` | Build all TS packages |
| `pnpm build:rust` | Build all Rust crates (release) |

### Test

| Command | Description |
|---------|-------------|
| `pnpm test:api` | Test backend API |
| `pnpm test:daemon` | Test Rust daemon |
| `pnpm test:sdk` | Test TypeScript SDK |
| `pnpm test:sdk-py` | Test Python SDK |
| `pnpm test:rust` | Run all Rust tests |

### Database

| Command | Description |
|---------|-------------|
| `pnpm db` | Open Drizzle Studio (visual DB browser) |
| `pnpm db:push` | Push schema changes directly (dev only) |
| `pnpm db:migrate` | Run migrations |
| `pnpm db:generate` | Generate migration files from schema |
| `pnpm db:seed` | Seed dev fixtures |

### Docker

| Command | Description |
|---------|-------------|
| `pnpm docker:dev` | Start full local infrastructure stack |
| `pnpm docker:up` | Start full stack |
| `pnpm docker:down` | Stop all containers |
| `pnpm docker:logs` | Tail container logs |
| `pnpm docker:ps` | Show container status |
| `pnpm docker:reset` | Stop containers and wipe all volumes |

### CI

| Command | Description |
|---------|-------------|
| `pnpm ci` | Full CI — check + build:packages + test |
| `pnpm ci:ts` | TypeScript only — check + build + test |
| `pnpm ci:rust` | Rust only — clippy + build + test |
| `pnpm ci:python` | Python only — pytest across all packages |

### Setup

| Command | Description |
|---------|-------------|
| `pnpm hooks:install` | Activate local CI git hooks (run once after cloning) |

---

## Monorepo structure

```
maschina/
├── apps/                   # User-facing applications
│   ├── app/                # Main product dashboard (React + Vite + TanStack)
│   ├── auth/               # Standalone auth app
│   ├── admin/              # Internal admin app
│   ├── console/            # Internal admin console
│   ├── desktop/            # Tauri 2 desktop (macOS, Windows, Linux)
│   ├── developers/         # Developer portal
│   ├── docs/               # Documentation site (Mintlify)
│   ├── mobile/
│   │   ├── android/        # Native Android (Kotlin + Jetpack Compose + Material 3)
│   │   │   └── wear/       # Wear OS module (standalone=false)
│   │   └── ios/            # Native iOS (Swift + SwiftUI)
│   │       └── MaschinaWatch/ # watchOS extension
│   └── web/                # Marketing site
│
├── services/               # Backend microservices
│   ├── api/                # TypeScript / Hono — business logic API (port 3000)
│   ├── analytics/          # Analytics service
│   ├── daemon/             # Rust / Tokio — agent job orchestrator (port 9090 health)
│   ├── email/              # Email service
│   ├── gateway/            # Rust / Axum — public edge, auth, rate limiting, proxy (port 8080)
│   ├── realtime/           # Rust / Axum — WebSocket + SSE hub (port 4000)
│   ├── runtime/            # Python / FastAPI — agent execution sandbox (port 8001)
│   └── worker/             # Python — NATS job consumer (email, webhooks, analytics)
│
├── packages/               # Shared libraries
│   ├── auth/               # JWT, argon2id, sessions, API keys, RBAC, OAuth
│   ├── billing/            # Stripe Checkout, webhooks, credits
│   ├── cache/              # ioredis wrapper
│   ├── chain/              # Solana program interactions
│   ├── cli/                # Rust CLI (maschina binary)
│   ├── code/               # Rust TUI scaffold tool (maschina-code binary)
│   ├── compliance/         # Audit log export, GDPR deletion (stub)
│   ├── config/             # Shared app configuration
│   ├── connectors/         # 3rd party connector integrations (stub)
│   ├── content/            # Brand copy, product text
│   ├── core/               # Agent pipeline primitives
│   ├── crypto/             # Encryption utilities
│   ├── db/                 # Drizzle schemas (pg + sqlite dual-dialect), migrations
│   ├── email/              # Resend client, React Email templates (5 templates)
│   ├── errors/             # Shared error types
│   ├── events/             # Typed NATS event definitions + subject registry
│   ├── flags/              # Feature flags (LaunchDarkly + PostHog)
│   ├── jobs/               # Job type definitions + NATS dispatch helpers
│   ├── keys/               # API key management utilities
│   ├── marketplace/        # Agent marketplace (stub)
│   ├── model/              # Model catalog, tier access gates, billing multipliers
│   ├── nats/               # NATS/JetStream client, streams, publish, consume
│   ├── notifications/      # In-app + NATS fan-out notification dispatch
│   ├── payments/           # Payment primitives
│   ├── plans/              # All 7 tiers, gates, quota limits (single source of truth)
│   ├── query/              # TanStack Query hook suite
│   ├── ratelimit/          # Rate limiting primitives
│   ├── reputation/         # On-chain reputation scoring (stub)
│   ├── risk/               # Python — input/output safety checks, PII scan
│   ├── runtime/            # Python — AgentRunner, tool calling, multi-turn loop
│   ├── agents/             # Python — Agent base class, 5 agent types
│   ├── sdk/
│   │   ├── ts/             # TypeScript SDK (@maschina/sdk)
│   │   ├── python/         # Python SDK (maschina-sdk)
│   │   └── rust/           # Rust SDK (maschina-sdk-rs)
│   ├── search/             # Meilisearch client, index definitions
│   ├── storage/            # Object storage (S3/CloudFront)
│   ├── telemetry/          # OpenTelemetry SDK init + tracer helpers
│   ├── treasury/           # Solana treasury management (stub)
│   ├── tsconfig/           # Shared TypeScript configs
│   ├── types/              # Shared TypeScript types
│   ├── ui/                 # shadcn/ui + HeroUI components (55 components)
│   ├── usage/              # Redis quota enforcement + PG audit log
│   ├── validation/         # Zod schemas, sanitization, projection helpers
│   ├── vector/             # Qdrant + pgvector client wrappers
│   └── webhooks/           # Outbound webhook signing, retry, delivery log
│
├── docker/                 # Docker Compose for local dev
│   └── docker-compose.yml  # Postgres, Redis, NATS, Meilisearch, Qdrant, Temporal, Grafana...
│
├── install/                # Curl install script (operators)
├── .github/
│   ├── hooks/              # Local CI git hooks
│   └── workflows/          # GitHub Actions: ci, deploy, release, semantic-release,
│                           #   codeql, secrets-scan, stale, dependabot-auto-merge
│
├── Cargo.toml              # Rust workspace
├── biome.json              # Formatter + linter (TypeScript)
└── turbo.json              # Turborepo build pipeline
```

---

## Database

Two backends supported, switched via `DATABASE_URL` in `.env`:

**PostgreSQL** (recommended):
```sh
DATABASE_URL="postgresql://maschina:maschina@localhost:5432/maschina"
pnpm docker:dev
```

**SQLite** (zero-config, no Docker needed):
```sh
DATABASE_URL="file:./dev.db"
```

Client auto-detects dialect from the URL prefix.

---

## Local CI

Checks run automatically before every `git push`:

```sh
pnpm hooks:install   # run once after cloning
```

Runs: Biome check → package builds → full test suite. Push is blocked if anything fails.

To run manually at any time:
```sh
pnpm ci
```

---

## License

Proprietary. All rights reserved. © 2026 Maschina.
