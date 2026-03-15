# Maschina — Technology Stack

> Canonical reference for every technology decision in the Maschina platform.
> Update this file when a technology is added, replaced, or deprecated.

---

## Languages

| Language | Role |
|---|---|
| **TypeScript** | Packages, web applications, API business logic |
| **Rust** | Control plane, CLI, gateway, daemon, realtime, desktop shell (Tauri) |
| **Python** | AI/ML workloads, agent execution runtime, model inference |

---

## Web Applications (`apps/`)

| Technology | Purpose |
|---|---|
| **Vite** | Build tool — fast HMR, ESM-native, replaces Next.js/Webpack |
| **React 19** | UI framework |
| **TanStack Router** | Type-safe file-based routing |
| **TanStack Query** | Server state, caching, background refetch, optimistic updates |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Headless component primitives (Radix UI) |
| **Phosphor Icons** | Icon system |

### Apps

| App | Description |
|---|---|
| `apps/web` | Marketing site, pricing, public-facing content |
| `apps/app` | Main product dashboard — agents, usage, billing |
| `apps/developers` | Developer portal — API keys, webhooks, usage; `auth/` + `admin/` sections |
| `apps/console` | Internal admin console (Maschina team only) |
| `apps/docs` | Public developer documentation site |
| `apps/desktop` | Desktop client (Tauri 2 — Linux, Windows, macOS) |
| `apps/mobile/android` | Android client — Kotlin + Jetpack Compose + Material 3 |
| `apps/mobile/ios` | iOS client — Swift + SwiftUI |

---

## Desktop (`apps/desktop`)

| Technology | Purpose |
|---|---|
| **Tauri v2** | Cross-platform desktop shell — Rust core, WebView frontend, file system / OS access |
| **Rust** | Tauri backend commands, local agent execution, system tray |

Targets: Linux, Windows, macOS. All three from day one via a single Tauri codebase wrapping `apps/app`.

> macOS native would be Swift, but Tauri covers all three desktop platforms without per-OS code. Native per-OS desktop frameworks are a post-revenue consideration.

---

## Mobile (`apps/mobile/android`, `apps/mobile/ios`)

### Android — `apps/mobile/android`

| Technology | Purpose |
|---|---|
| **Kotlin** | Primary language — modern, null-safe, coroutines-native |
| **Jetpack Compose** | Declarative UI framework — replaces XML layouts |
| **Material 3** | Design system — `androidx.compose.material3`, components from material.io/components |
| **Kotlin Coroutines** | Async / structured concurrency |
| **Retrofit** | HTTP client for API calls |
| **DataStore** | Local preference and session storage |

### iOS — `apps/mobile/ios`

| Technology | Purpose |
|---|---|
| **Swift** | Primary language |
| **SwiftUI** | Declarative UI framework |
| **Combine / async-await** | Reactive state and async networking |
| **URLSession** | HTTP client |
| **Keychain** | Secure token storage |

---

## CLI & Developer Tools

| Tool | Package | Purpose |
|---|---|---|
| **Clap** (Rust) | `packages/cli` | Operator CLI — `maschina init/agent/keys/status` |
| **Ratatui** (Rust) | `packages/code` | TUI scaffold tool — interactive agent/route/connector generation |

---

## Backend Services (`services/`)

### API Layer

| Technology | Purpose |
|---|---|
| **Hono** (TypeScript) | `services/api` — Developer-facing REST API: auth, billing, agents, usage, webhooks |
| **Axum** (Rust) | `services/gateway` — Public edge: JWT validation, rate limiting, reverse proxy, WebSocket upgrade |

> `services/api` handles business logic. `services/gateway` handles edge concerns (auth, rate limiting, routing).
> Intentional split — mirrors the Cloudflare edge / origin pattern. Both are kept.

### Agent Orchestration

| Technology | Purpose |
|---|---|
| **Rust + Tokio** | `services/daemon` — SCAN → EVALUATE → EXECUTE → ANALYZE loop |
| **NATS JetStream** | Job dispatch — pull consumer on `MASCHINA_JOBS` stream (replaced PostgreSQL SKIP LOCKED) |
| **Semaphore** | Concurrency limiting per daemon instance |

### AI/ML Runtime

| Technology | Purpose |
|---|---|
| **Python / FastAPI** | `services/runtime` — agent execution sandbox, calls LLM providers |
| **maschina-runtime** | `packages/runtime` — `AgentRunner` with multi-turn + tool calling loop |
| **maschina-agents** | `packages/agents` — Signal, Analysis, Execution, Optimization, Reporting agent types |
| **maschina-risk** | `packages/risk` — pre/post run risk checks: prompt injection, PII scan, quota guard |
| **Anthropic SDK** | Claude API integration (primary LLM provider) |

### Realtime

| Technology | Purpose |
|---|---|
| **Rust + Axum** | `services/realtime` — WebSocket hub, SSE, per-user broadcast registry |
| **NATS core subscriptions** | Event fan-out source — subscribes to agent/notification/billing subjects |

---

## Authentication

| Technology | Purpose |
|---|---|
| **Custom auth** (`packages/auth`) | JWT/session/argon2id — email+password, OAuth, email verification, password reset, token rotation |
| **API keys** | `msk_live_*` / `msk_test_*` — prefix-based lookup, timing-safe hash comparison |
| **RBAC** | Plan-tier and role-based permission gates |
| **jose** | JWT signing/verification (HS256) |
| **argon2** | Password hashing — memory-hard, GPU-resistant |

> Custom auth is intentional — full ownership, no third-party session storage, no external dependency in the auth path.

---

## Database

| Technology | Purpose |
|---|---|
| **PostgreSQL** | Primary production database |
| **Neon** | Serverless PostgreSQL hosting (branching for preview environments) |
| **SQLite** | Local development (auto-detected from `DATABASE_URL=file:...`) |
| **Drizzle ORM** | Type-safe query builder, dual-dialect (pg + sqlite) |
| **drizzle-kit** | Migrations (`db:generate`, `db:migrate`, `db:push`) |
| **pgvector** | Vector embeddings co-located in PostgreSQL (zero extra infra for simple RAG) |

### Dialect detection

`DATABASE_URL` prefix determines dialect at runtime:
- `file:` → SQLite (better-sqlite3)
- anything else → PostgreSQL (postgres.js)

---

## Caching

| Technology | Purpose |
|---|---|
| **Redis** | Quota counters (atomic `INCRBY`), rate limiting, session store |
| **ioredis** | TypeScript client (`packages/cache`) |

---

## Messaging & Event System

| Technology | Purpose |
|---|---|
| **NATS** | Inter-service messaging, real-time event fan-out |
| **NATS JetStream** | Persistent streams, pull consumers for job queues, push consumers for events |

### Streams

| Stream | Retention | Purpose |
|---|---|---|
| `MASCHINA_JOBS` | WorkQueue | Agent + email + billing + maintenance job dispatch |
| `MASCHINA_AGENTS` | Limits (7d) | Agent run lifecycle events |
| `MASCHINA_USERS` | Limits (7d) | User registration, verification, profile events |
| `MASCHINA_BILLING` | Limits (7d) | Subscription, payment, credit events |
| `MASCHINA_NOTIFICATIONS` | Limits (7d) | In-app notification fan-out |
| `MASCHINA_USAGE` | Limits (7d) | Quota enforcement audit events |

---

## Workflow Orchestration

| Technology | Purpose |
|---|---|
| **Temporal** | Durable multi-step workflow execution — retries, timeouts, persistent state across failures |

> **When to use Temporal vs NATS JetStream:**
> NATS JetStream = fire-and-forget job dispatch (daemon picks up a job and runs it).
> Temporal = multi-step workflows spanning hours/days: "run agent A → wait for human approval → run agent B → send report".
> Both coexist. NATS handles the fast path; Temporal handles orchestrated pipelines.

---

## Search

| Technology | Purpose |
|---|---|
| **Meilisearch** | Full-text search — marketplace listings, agent library, documentation, user-facing search |

> Self-hostable, fast, instant search with typo tolerance. Runs in Docker locally, managed instance in production.

---

## Vector Database

| Technology | Purpose |
|---|---|
| **Qdrant** | Dedicated vector DB — high-performance ANN search, RAG pipelines, semantic similarity |
| **pgvector** | Lightweight embeddings co-located in PostgreSQL (simple use cases) |

> Use pgvector for simple per-user embedding lookup. Use Qdrant when you need ANN indexing at scale, filtering on metadata, or multi-collection semantic search.

---

## ML Observability

| Technology | Purpose |
|---|---|
| **LangSmith** | LLM tracing — prompt/response capture, latency, token usage, eval harnesses |
| **Weights & Biases** | Experiment tracking, model metrics, training run comparisons |

---

## Object Storage

| Technology | Purpose |
|---|---|
| **AWS S3** | Agent artifacts, model checkpoints, large run outputs, user file uploads |
| **CloudFront** | CDN in front of S3 for static assets and public files |

---

## Infrastructure

| Technology | Purpose |
|---|---|
| **Docker** | Local development, CI builds, service containerization |
| **Fly.io** | Early-stage deployment — runs all backend services globally on hardware VMs; simple `fly deploy` per service |
| **AWS** | Scale target — S3 (storage), CloudFront (CDN), ECS (compute when outgrowing Fly.io) |
| **Terraform** | Infrastructure as Code — manages AWS, Neon, Cloudflare resources |
| **Cloudflare** | Edge network, DNS, DDoS protection |

### Deployment phases

| Phase | Infrastructure | When |
|---|---|---|
| **1 — Launch** | Fly.io + Neon + Redis + Docker | Now → ~10k users |
| **2 — Growth** | Fly.io + Kubernetes (Fly Machines / k8s on Fly) | 10k → 100k users |
| **3 — Scale** | AWS ECS / EKS + Neon or RDS + ElastiCache | 100k+ / Series A |

S3 + CloudFront (AWS) are used from Phase 1 onward — storage and CDN don't change across phases.
Fly.io handles all backend services in Phase 1 + 2. AWS ECS/EKS takes over compute in Phase 3.
Both Fly.io and AWS stay in the TECHSTACK — Fly.io is early deployment, AWS is the scale target.

---

## Blockchain

| Technology | Purpose |
|---|---|
| **Helius** | Solana RPC access, on-chain event webhooks, transaction parsing |
| **Solana** | On-chain agent reputation, USDC staking, marketplace settlement |

> Schema: `wallet_addresses`, `reputation_scores.staked_usdc`, `reputation_scores.on_chain_address`.

---

## Billing

| Technology | Purpose |
|---|---|
| **Stripe** | Subscriptions, Checkout (hosted), billing portal, webhooks |
| **Stripe Checkout** | Hosted payment page — never handle raw card data |
| **Prepaid credits** | Top-up balance in cents, consumed after plan quota exhausted, rolls over |

### Plans

| Plan | Price | Notes |
|---|---|---|
| Access | Free | Local Ollama only, 50 runs/mo |
| Mach-1 (M1) | $20/mo · $204/yr | Entry cloud |
| Mach-5 (M5) | $60/mo · $600/yr | Main individual tier |
| Mach-10 (M10) | $100/mo · $995/yr | Power user |
| Mach Team | $30/seat/mo · $300/seat/yr | 10–24 seats: $27/seat. 25+: Enterprise |
| Enterprise | Custom | Contact sales |
| Internal | Free | Maschina team only, all limits bypassed |

---

## Observability

| Technology | Purpose |
|---|---|
| **OpenTelemetry** | Distributed tracing across all services — TypeScript, Rust, Python |
| **Grafana Tempo** | Distributed trace storage (OTLP endpoint) |
| **Prometheus** | Metrics collection — instrumented in `services/daemon` |
| **Grafana** | Dashboards connected to Prometheus + Loki + Tempo |
| **Grafana Loki** | Log aggregation across all services |
| **Sentry** | Error tracking — React frontend, TypeScript API, Rust services |

> OTel is non-negotiable in a polyglot system. A single agent run crosses 4 services (gateway → api → daemon → runtime).
> Without traces, cross-service debugging is guesswork.
>
> **Status:** `packages/telemetry` (TypeScript OTel SDK) built and wired into `services/api`.
> Rust services use `tracing` + `opentelemetry` crates. Python services use `opentelemetry-sdk`.

---

## Analytics & Product

| Technology | Purpose |
|---|---|
| **PostHog** | Product analytics, session replay, feature flags (self-hosted or cloud) |
| **Plausible Analytics** | Privacy-first web analytics for `apps/web` |

---

## Feature Flags

| Technology | Purpose |
|---|---|
| **LaunchDarkly** | Production feature flags, gradual rollouts, kill switches |
| **PostHog** | Experiment flags, A/B testing |
| **DB-backed flags** | `feature_flags` + `feature_flag_overrides` tables — internal overrides without external dependency |

---

## Email

| Technology | Purpose |
|---|---|
| **Resend** | Transactional email — verification, password reset, billing receipts, agent notifications |
| **React Email** | Email template authoring in JSX |

> Status: wired, sending is no-op until `RESEND_API_KEY` is set. Activated post-domain setup.
> `packages/email` built with 5 templates. Email job consumer runs in `services/api` via NATS.

---

## Webhook Delivery

| Technology | Purpose |
|---|---|
| **Svix** | Managed outbound webhook delivery — retries, signatures, delivery dashboard, developer portal |

> `webhooks` + `webhook_deliveries` schema exists. Svix activates when external developer webhooks ship.

---

## Secrets Management

| Technology | Purpose |
|---|---|
| **Doppler** | Centralized secrets store — syncs to `.env`, Docker, CI, production |

---

## Code Quality

| Technology | Purpose |
|---|---|
| **Biome** | TypeScript/JavaScript linting + formatting (replaces ESLint + Prettier — one tool, significantly faster) |
| **Clippy** | Rust static analysis |
| **Ruff** | Python linting and formatting |

---

## Testing

| Technology | Purpose |
|---|---|
| **Vitest** | TypeScript/JavaScript unit + integration tests |
| **Playwright** | End-to-end browser tests across all web apps |
| **Testing Library** | Component-level React testing |
| **Cargo test** | Rust unit + integration tests |
| **Pytest** | Python unit tests — runtime, agents, ML, risk |
| **k6** | Load and performance testing |

---

## Git Workflow

| Technology | Purpose |
|---|---|
| **Husky** | Git hook manager — runs checks pre-commit and on commit-msg |
| **lint-staged** | Runs Biome + Ruff only on staged files (fast pre-commit) |
| **Commitlint** | Enforces Conventional Commits format on every commit message |
| **Dependabot** | Automated dependency update PRs (npm, Cargo, pip, GitHub Actions) |

---

## Monorepo Tooling

| Technology | Purpose |
|---|---|
| **pnpm** | Package manager — workspaces, strict isolation, fast installs |
| **Turborepo** | Build orchestration, task caching, dependency graph |

---

## Decisions Log

| Decision | Status | Notes |
|---|---|---|
| Mobile stack | **Confirmed** | Android = Kotlin + Jetpack Compose + Material 3. iOS = Swift + SwiftUI. No Tauri mobile. |
| Desktop stack | **Confirmed** | Tauri 2 for Linux + Windows + macOS from day one. Native per-OS desktop post-revenue. |
| Custom auth | **Confirmed** | Full ownership. No third-party auth library. |
| NATS job queue | **Done** | NATS JetStream replaced PostgreSQL SKIP LOCKED in `services/daemon`. Redis stays for quota counters only. |
| Hono + Axum split | **Confirmed** | Both used intentionally. Gateway = Axum edge. API = Hono business logic. |
| Email (Resend) | **Deferred** | No-op until `RESEND_API_KEY` set. Activated post-domain. Tokens already generated. |
| Drizzle migrations | **Needed** | Run `pnpm db:generate && pnpm db:migrate` once after initial setup. |
| Meilisearch | **Confirmed** | Replaces Typesense. Self-hostable, instant search. |
| Qdrant | **Confirmed** | Dedicated vector DB alongside pgvector. Qdrant for scale; pgvector for simple collocated embeddings. |
| Temporal | **Confirmed** | Durable workflow orchestration for multi-step agent pipelines. Complements (does not replace) NATS. |
| OpenTelemetry | **In progress** | `packages/telemetry` built, wired into `services/api`. Rust + Python services instrumented next. |
| Svix | **Planned** | Add when outbound developer webhooks ship. |
| Email encryption | **Planned** | `users.email` encrypted at rest; `emailIndex` (HMAC) for lookups. Schema ready, encryption layer not built. |
