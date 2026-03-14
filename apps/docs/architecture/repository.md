# Repository Architecture

---

## Monorepo Structure

```
maschina/
├── apps/                    ← Web and native applications
│   ├── app/                 ← Main product dashboard (React + Vite + TanStack)
│   ├── auth/                ← Standalone auth app
│   ├── admin/               ← Internal admin app
│   ├── console/             ← Internal admin console (Maschina team only)
│   ├── desktop/             ← Tauri 2 desktop (macOS, Windows, Linux)
│   ├── developers/          ← Developer portal
│   ├── docs/                ← Public developer documentation (Mintlify)
│   ├── mobile/
│   │   ├── android/         ← Android (Kotlin + Jetpack Compose + Material 3)
│   │   │   └── wear/        ← Wear OS module (standalone=false, bridged from phone)
│   │   └── ios/             ← iOS (Swift + SwiftUI)
│   │       └── MaschinaWatch/ ← watchOS extension (WCSession, 5 complication families)
│   └── web/                 ← Marketing site
│
├── services/                ← Backend microservices
│   ├── api/                 ← TypeScript / Hono — business logic API (port 3000)
│   ├── analytics/           ← Analytics service
│   ├── daemon/              ← Rust / Tokio — agent job orchestrator (port 9090 health)
│   ├── email/               ← Email service
│   ├── gateway/             ← Rust / Axum — public edge, auth, rate limiting, proxy (port 8080)
│   ├── realtime/            ← Rust / Axum — WebSocket + SSE hub (port 4000)
│   ├── runtime/             ← Python / FastAPI — agent execution sandbox (port 8001)
│   └── worker/              ← Python — NATS consumer (email, webhook, analytics jobs)
│
├── packages/                ← Shared libraries
│   ├── auth/                ← TypeScript — JWT, argon2id, sessions, API keys, RBAC, OAuth
│   ├── billing/             ← TypeScript — Stripe Checkout, webhooks, credits
│   ├── cache/               ← TypeScript — ioredis wrapper
│   ├── chain/               ← TypeScript — Solana program interactions
│   ├── compliance/          ← TypeScript — audit log, GDPR deletion (stub)
│   ├── config/              ← TypeScript — shared app configuration
│   ├── connectors/          ← TypeScript — 3rd party connector integrations (stub)
│   ├── content/             ← TypeScript — brand copy, product text
│   ├── core/                ← TypeScript — agent pipeline primitives
│   ├── crypto/              ← TypeScript — encryption utilities
│   ├── db/                  ← TypeScript — Drizzle schemas (pg + sqlite), migrations
│   ├── email/               ← TypeScript — Resend client, React Email templates
│   ├── errors/              ← TypeScript — shared error types
│   ├── events/              ← TypeScript — NATS event type definitions + subject registry
│   ├── flags/               ← TypeScript — LaunchDarkly + PostHog feature flags
│   ├── jobs/                ← TypeScript — job type definitions + NATS dispatch helpers
│   ├── keys/                ← TypeScript — API key management utilities
│   ├── marketplace/         ← TypeScript — agent marketplace (stub)
│   ├── model/               ← TypeScript — model catalog, tier gates, billing multipliers
│   ├── nats/                ← TypeScript — NATS/JetStream client, streams
│   ├── notifications/       ← TypeScript — in-app + NATS fan-out notification dispatch
│   ├── payments/            ← TypeScript — payment primitives
│   ├── plans/               ← TypeScript — all 7 tiers, gates, quota limits
│   ├── query/               ← TypeScript — TanStack Query hook suite
│   ├── ratelimit/           ← TypeScript — rate limiting primitives
│   ├── reputation/          ← TypeScript — on-chain reputation scoring (stub)
│   ├── search/              ← TypeScript — Meilisearch client, index definitions
│   ├── storage/             ← TypeScript — S3/CloudFront object storage
│   ├── telemetry/           ← TypeScript — OpenTelemetry SDK init + tracer helpers
│   ├── treasury/            ← TypeScript — Solana treasury management (stub)
│   ├── tsconfig/            ← Shared TypeScript compiler configs
│   ├── types/               ← Shared TypeScript types
│   ├── ui/                  ← shadcn/ui + HeroUI + Headless UI (55 components)
│   ├── usage/               ← TypeScript — Redis quota enforcement + PG audit log
│   ├── validation/          ← TypeScript — Zod schemas, sanitization, projection helpers
│   ├── vector/              ← TypeScript — Qdrant + pgvector client wrappers
│   ├── webhooks/            ← TypeScript — outbound webhook signing, retry, delivery log
│   ├── agents/              ← Python — agent base class, 5 agent types
│   ├── risk/                ← Python — input/output safety checks, PII scan
│   ├── runtime/             ← Python — AgentRunner, tool calling, multi-turn loop
│   ├── sdk/
│   │   ├── ts/              ← TypeScript SDK (@maschina/sdk)
│   │   ├── python/          ← Python SDK (maschina-sdk)
│   │   └── rust/            ← Rust SDK (maschina-sdk-rs)
│   ├── cli/                 ← Rust — Clap CLI (maschina binary)
│   └── code/                ← Rust — Ratatui TUI scaffold tool (maschina-code binary)
│
├── docker/                  ← Docker Compose for local development
│   └── docker-compose.yml   ← Postgres, Redis, NATS, Meilisearch, Qdrant, Temporal, Grafana...
│
├── install/                 ← Curl install script for operators
├── .github/
│   ├── hooks/               ← Local pre-commit + commit-msg git hooks
│   └── workflows/           ← ci.yml, deploy.yml, release.yml, semantic-release.yml,
│                            ←   codeql.yml, secrets-scan.yml, stale.yml, dependabot-auto-merge.yml
│
├── Cargo.toml               ← Rust workspace
├── biome.json               ← Biome linting + formatting config
├── turbo.json               ← Turborepo task graph
└── pnpm-workspace.yaml      ← pnpm workspace config
```

---

## Package Manager

**pnpm** with workspaces. Strict isolation — packages cannot access unlisted dependencies.

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "services/*"
  - "packages/*"
```

Every TypeScript package and app declares its dependencies explicitly. Cross-package imports use workspace protocol:

```json
{ "dependencies": { "@maschina/db": "workspace:*" } }
```

---

## Build Orchestration — Turborepo

Turborepo manages the task dependency graph, remote caching, and parallel execution.

```json
// turbo.json (abbreviated)
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "lint": {}
  }
}
```

### Common commands

```bash
pnpm build                               # build all packages and services
pnpm --filter @maschina/api build        # build only api + its deps
pnpm typecheck                           # type-check all TypeScript packages
pnpm exec biome check packages/ services/ # Biome lint across all TS packages
pnpm exec vitest run                     # run all Vitest tests (root config)
```

---

## TypeScript Packages (`packages/*`)

All TypeScript packages follow the same structure:

```
packages/auth/
  src/
    index.ts          ← public exports
    *.ts              ← implementation files
  package.json        ← name: "@maschina/auth"
  tsconfig.json       ← extends @maschina/tsconfig/node.json
  dist/               ← compiled output (gitignored)
```

Packages export via `"exports"` in `package.json` using the `./dist/index.js` convention. Turborepo builds each package before its dependents run.

## Python Packages (`packages/runtime`, `packages/agents`, `packages/risk`)

```
packages/runtime/
  src/
    maschina_runtime/
      __init__.py
      runner.py
      tools.py
      models.py
  tests/
    test_runner.py
  pyproject.toml       ← name: "maschina-runtime"
```

Installed as editable installs (`uv pip install -e .`) in `services/runtime`'s virtual environment.

## Rust Packages (`packages/cli`, `packages/code`)

```
packages/cli/
  src/
    main.rs
    commands/
    config.rs
    client.rs
  Cargo.toml           ← package name: "maschina-cli"
```

Built with `cargo build --release`. Binaries: `maschina` (CLI), `maschina-code` (TUI scaffold tool).

---

## Naming Conventions

### Package names

- TypeScript: `@maschina/<name>` (e.g., `@maschina/auth`, `@maschina/db`)
- Python: `maschina-<name>` (e.g., `maschina-runtime`, `maschina-risk`)
- Rust crates: `maschina-<name>` (e.g., `maschina-cli`, `maschina-code`)

### File naming

- TypeScript: `camelCase.ts`, exported types in `PascalCase`
- Rust: `snake_case.rs`
- Python: `snake_case.py`

### Import extensions

TypeScript uses `.js` extensions in all import paths (ESM):

```typescript
import { createUser } from "./user.js";
import { db } from "@maschina/db";
```

---

## Build Graph

Critical dependency order (Turborepo enforces this):

```
packages/db
  ↓
packages/auth
packages/plans
packages/cache
packages/usage
  ↓
packages/billing
packages/nats
packages/jobs
packages/events
packages/model
  ↓
packages/notifications
packages/email
packages/telemetry
packages/validation
  ↓
services/api
```

Rust and Python packages build independently of the TypeScript graph.
