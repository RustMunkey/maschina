# Maschina

Infrastructure for autonomous digital labor. A modular platform for deploying networks of AI agents that continuously discover, evaluate, and execute digital opportunities.

> **Status:** Active development. v0.62.0.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Web apps | TypeScript, React 19, Vite, TanStack Router, Tailwind CSS |
| Backend API | TypeScript (Hono, port 3000) |
| Agent runtime | Python (FastAPI, port 8001) |
| ML / RL | Python (PyTorch, NumPy, scikit-learn) |
| Daemon / Gateway / Realtime | Rust (Tokio, Axum) |
| CLI | Rust (Clap, Ratatui) |
| Compute node | Rust |
| Desktop | Rust (Tauri 2) |
| Mobile | iOS: Swift + SwiftUI · Android: Kotlin + Jetpack Compose + Material 3 |
| Database | PostgreSQL (Neon prod) / SQLite (local dev) via Drizzle |
| Job queue | NATS JetStream |
| Cache | Redis |
| Monorepo | pnpm + Turborepo |
| Formatting / Linting | Biome (TS), Clippy (Rust), Ruff (Python) |
| Testing | Vitest (TS), cargo test (Rust), pytest (Python) |

---

## Prerequisites

- [Node.js](https://nodejs.org) >= 22
- [pnpm](https://pnpm.io) >= 10 — `npm install -g pnpm`
- [Rust](https://rustup.rs) 1.88+ toolchain
- [Python](https://python.org) >= 3.12 + [uv](https://github.com/astral-sh/uv)
- [Docker](https://docker.com) (Postgres, Redis, NATS, and other infrastructure)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) (desktop app only)

---

## Install CLI

```sh
curl -fsSL https://maschina.dev/install.sh | sh
```

Installs the `maschina` binary to `~/.local/bin`. See `maschina --help` to get started.

---

## Setup (monorepo dev)

```sh
# 1. Clone
git clone git@github.com:RustMunkey/maschina.git
cd maschina

# 2. Install JS dependencies
pnpm install

# 3. Install git hooks (pre-commit lint + commit-msg format check)
pnpm prepare

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

# 6. Start infrastructure (Postgres, Redis, NATS, Meilisearch, Qdrant, Temporal, Grafana)
pnpm docker:dev

# 7. Run DB migrations
pnpm db:migrate
```

---

## Commands

Everything runs from root via `pnpm`. Native tools (`cargo`, `pytest`, etc.) still work normally.

### Global

| Command | Description |
|---------|-------------|
| `pnpm build` | Build everything |
| `pnpm dev` | Dev all services in parallel |
| `pnpm test` | Run all tests (TS + Rust + Python) |
| `pnpm check` | Biome lint + format check |
| `pnpm format` | Biome format with auto-fix |
| `pnpm typecheck` | Full TypeScript type check |
| `pnpm clean` | Clean all build outputs |

### Services (dev mode)

| Command | Description |
|---------|-------------|
| `pnpm api` | Backend API (Hono, :3000) |
| `pnpm gateway` | Rust API gateway (:8080) |
| `pnpm daemon` | Rust agent orchestrator |
| `pnpm realtime` | Rust WebSocket/SSE hub (:4000) |
| `pnpm runtime` | Python agent execution runtime (:8001) |
| `pnpm worker` | Python NATS job worker |
| `pnpm cli` | Maschina CLI (dev mode) |

### Apps (dev mode)

| Command | Description |
|---------|-------------|
| `pnpm app` | Main dashboard |
| `pnpm web` | Marketing site |
| `pnpm doc` | Documentation site |
| `pnpm console` | Admin console |
| `pnpm desktop` | Tauri desktop app |

### Build

| Command | Description |
|---------|-------------|
| `pnpm build:packages` | Build all TS packages |
| `pnpm build:api` | Build backend API |
| `pnpm build:daemon` | Build Rust daemon |
| `pnpm build:cli` | Build Maschina CLI (release binary) |
| `pnpm build:rust` | Build all Rust crates (release) |

### Test

| Command | Description |
|---------|-------------|
| `pnpm test:api` | API service tests |
| `pnpm test:rust` | All Rust tests |
| `pnpm test:sdk` | TypeScript SDK tests |
| `pnpm test:sdk-py` | Python SDK tests |

### Database

| Command | Description |
|---------|-------------|
| `pnpm db` | Open Drizzle Studio |
| `pnpm db:generate` | Generate migration files from schema |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:push` | Push schema directly (dev only) |
| `pnpm db:seed` | Seed dev fixtures |

### Docker

| Command | Description |
|---------|-------------|
| `pnpm docker:dev` | Start full local infrastructure stack |
| `pnpm docker:up` | Start containers |
| `pnpm docker:down` | Stop containers |
| `pnpm docker:logs` | Tail container logs |
| `pnpm docker:ps` | Show container status |
| `pnpm docker:reset` | Stop and wipe all volumes |

### CI

| Command | Description |
|---------|-------------|
| `pnpm ci` | Full CI — check + build + test |
| `pnpm ci:ts` | TypeScript — check + build + test |
| `pnpm ci:rust` | Rust — clippy + build + test |
| `pnpm ci:python` | Python — pytest across all packages |

---

## Monorepo structure

```
maschina/
├── apps/
│   ├── app/          # Main product dashboard (React + Vite + TanStack Router)
│   ├── auth/         # Auth app — magic link + OAuth device flow
│   ├── admin/        # Internal admin panel
│   ├── console/      # Developer console
│   ├── desktop/      # Tauri 2 desktop (macOS, Windows, Linux)
│   ├── docs/         # Documentation site (MDX, Mermaid, Shiki)
│   ├── mobile/
│   │   ├── android/  # Native Android (Kotlin + Jetpack Compose + Material 3 + Wear OS)
│   │   └── ios/      # Native iOS (Swift + SwiftUI + watchOS)
│   ├── status/       # Public status page
│   └── web/          # Marketing site (React Three Fiber, globe viz)
│
├── services/
│   ├── api/          # TypeScript / Hono — business logic API (:3000)
│   ├── analytics/    # Analytics ingestion and aggregation
│   ├── daemon/       # Rust / Tokio — agent job orchestrator, scheduler, node dispatch
│   ├── email/        # Transactional email service
│   ├── gateway/      # Rust / Axum — public edge, auth, rate limiting, proxy (:8080)
│   ├── mcp/          # Python — MCP server (memory bridge for Claude dev instances)
│   ├── node/         # Rust — compute node binary (registers with network, executes jobs)
│   ├── realtime/     # Rust / Axum — WebSocket + SSE hub (:4000)
│   ├── runtime/      # Python / FastAPI — agent execution sandbox (:8001)
│   └── worker/       # Python — NATS consumer (email, webhooks, analytics)
│
├── packages/
│   ├── agents/       # Python — Agent base class, 5 agent types, tool calling
│   ├── api-client/   # Type-safe TypeScript API client
│   ├── assets/       # Brand assets and platform icons
│   ├── auth/         # JWT, argon2id, sessions, API keys, RBAC, device flow
│   ├── billing/      # Stripe Checkout, webhooks, credit ledger
│   ├── cache/        # ioredis wrapper
│   ├── chain/        # Solana program interactions (escrow, receipts)
│   ├── cli/          # Rust CLI — `maschina` binary (TUI, agent REPL, SSE streaming)
│   ├── code/         # Rust TUI scaffold (maschina-code binary)
│   ├── compliance/   # GDPR/CCPA — audit export, data deletion, consent records
│   ├── config/       # Shared configuration schemas
│   ├── connectors/   # Third-party API connectors (Slack, GitHub, etc.)
│   ├── content/      # Brand copy and product text
│   ├── core/         # Agent pipeline primitives
│   ├── crypto/       # AES-256-GCM encryption, HMAC, versioned key rotation
│   ├── db/           # Drizzle ORM — pg + sqlite dual-dialect, schemas, migrations
│   ├── email/        # Resend client + React Email templates
│   ├── errors/       # Shared error types
│   ├── events/       # Typed NATS subject registry and event schemas
│   ├── flags/        # Feature flags
│   ├── icons/        # Icon set (Phosphor, Simple Icons)
│   ├── jobs/         # Job type definitions + NATS dispatch helpers
│   ├── keys/         # API key hashing and management
│   ├── marketplace/  # Agent marketplace (listings, ratings, install)
│   ├── ml/           # Python — ML utilities (numpy, pandas, sklearn)
│   ├── model/        # Model catalog, tier gates, billing multipliers, cascade fallback
│   ├── nats/         # NATS/JetStream client and stream definitions
│   ├── notifications/# In-app + push notification dispatch
│   ├── payments/     # Payment primitives
│   ├── plans/        # 7 plan tiers, feature gates, quota limits (single source of truth)
│   ├── push/         # Web Push / APNs / FCM
│   ├── query/        # TanStack Query hooks
│   ├── ratelimit/    # Rate limiting rules and middleware
│   ├── reputation/   # Node reputation scoring
│   ├── risk/         # Python — input/output safety checks, PII scanning
│   ├── runtime/      # Python — AgentRunner, multi-turn loop, tool orchestration
│   ├── sdk/
│   │   ├── ts/       # TypeScript SDK (@maschina/sdk)
│   │   ├── python/   # Python SDK (maschina-sdk)
│   │   └── rust/     # Rust SDK (maschina-sdk-rs)
│   ├── search/       # Meilisearch client and index definitions
│   ├── storage/      # S3/object storage abstraction
│   ├── telemetry/    # OpenTelemetry + Sentry init
│   ├── treasury/     # Solana treasury management
│   ├── tsconfig/     # Shared TypeScript configs
│   ├── types/        # Shared TypeScript types
│   ├── ui/           # Component library (shadcn/ui + Radix + HeroUI + recharts)
│   ├── usage/        # Redis quota enforcement + PostgreSQL audit log
│   ├── validation/   # Zod schemas, sanitization helpers, projection functions
│   ├── vector/       # Qdrant + pgvector client wrappers
│   ├── vitest-config/# Shared Vitest configuration
│   ├── wasm/         # Rust → WASM modules (crypto, terminal)
│   ├── web-kit/      # Shared web primitives and utilities
│   └── webhooks/     # Outbound webhook signing, retry queue, delivery log
│
├── docker/
│   └── docker-compose.yml  # Postgres, Redis, NATS, Meilisearch, Qdrant, Temporal, Grafana
│
├── install/          # curl install script for the maschina CLI binary
├── .github/
│   ├── hooks/        # Local CI pre-push hooks
│   └── workflows/    # ci, deploy, release, semantic-release,
│                     # codeql, secrets-scan, stale, dependabot-auto-merge
│
├── Cargo.toml        # Rust workspace
├── biome.json        # Formatter + linter (TypeScript)
├── turbo.json        # Turborepo pipeline
└── rust-toolchain.toml
```

---

## Database

Two backends, switched via `DATABASE_URL`:

**PostgreSQL** (production / recommended):
```sh
DATABASE_URL="postgresql://maschina:maschina@localhost:5432/maschina"
pnpm docker:dev
```

**SQLite** (zero-config, no Docker):
```sh
DATABASE_URL="file:./dev.db"
```

The client auto-detects dialect from the URL prefix. The `packages/db/src/schema/pg/` schema is canonical — SQLite mirrors it for local dev.

---

## CI / CD

GitHub Actions runs on every push:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push / PR to main | Biome lint, TypeScript build + typecheck, Vitest, Rust clippy + test, Python pytest, CodeQL |
| `deploy.yml` | `v*` tag push | Deploy to production, Slack notification |
| `release.yml` | push to main | Semantic versioning, changelog, GitHub release |
| `secrets-scan.yml` | push | TruffleHog secret detection |
| `dependabot-auto-merge.yml` | Dependabot PRs | Auto-merge patch/minor updates |

Versioning follows [Conventional Commits](https://www.conventionalcommits.org): `feat` → minor, `fix` → patch, `chore` → no release.

---

## License

Proprietary. All rights reserved. © 2026 Maschina.
