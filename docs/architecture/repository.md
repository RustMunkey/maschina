# Repository Architecture


---

## Monorepo Structure

```
maschina/
├── apps/                    ← Web and native applications
│   ├── app/                 ← Main product dashboard (React + Vite + TanStack)
│   ├── web/                 ← Marketing site
│   ├── developers/          ← Developer portal — API keys, webhooks, usage
│   │   ├── auth/            ← Developer sign-up / login (custom auth)
│   │   └── admin/           ← Maschina team admin section
│   ├── console/             ← Internal admin console (Maschina team only)
│   ├── docs/                ← Public developer documentation site
│   ├── desktop/             ← Desktop client (Tauri 2 — Linux, Windows, macOS)
│   └── mobile/
│       ├── android/         ← Android client (Kotlin + Jetpack Compose + Material 3)
│       └── ios/             ← iOS client (Swift + SwiftUI)
│
├── services/                ← Backend microservices
│   ├── api/                 ← TypeScript / Hono — business logic API
│   ├── gateway/             ← Rust / Axum — public edge, auth, proxy
│   ├── daemon/              ← Rust / Tokio — agent job orchestrator
│   ├── realtime/            ← Rust / Axum — WebSocket/SSE hub
│   └── runtime/             ← Python / FastAPI — agent execution sandbox
│
├── packages/                ← Shared libraries
│   ├── auth/                ← TypeScript — JWT, sessions, argon2id, API keys
│   ├── billing/             ← TypeScript — Stripe Checkout, webhooks, credits
│   ├── cache/               ← TypeScript — ioredis wrapper
│   ├── database/            ← TypeScript — Drizzle schemas, migrations, client
│   ├── email/               ← TypeScript — Resend client, React Email templates
│   ├── events/              ← TypeScript — NATS event type definitions
│   ├── jobs/                ← TypeScript — job type definitions, dispatch helpers
│   ├── nats/                ← TypeScript — NATS/JetStream client, stream setup
│   ├── notifications/       ← TypeScript — in-app + NATS notification dispatch
│   ├── plans/               ← TypeScript — plan tiers, gates, quota definitions
│   ├── search/              ← TypeScript — Meilisearch client, index definitions
│   ├── telemetry/           ← TypeScript — OpenTelemetry SDK init
│   ├── usage/               ← TypeScript — Redis quota enforcement + PG audit
│   ├── validation/          ← TypeScript — Zod schemas, sanitization helpers
│   ├── vector/              ← TypeScript — Qdrant client, collection definitions
│   ├── agents/              ← Python — agent base classes, 5 agent types
│   ├── risk/                ← Python — input/output safety checks
│   ├── runtime/             ← Python — AgentRunner, Tool base, multi-turn loop
│   ├── cli/                 ← Rust — Clap CLI (maschina-cli binary)
│   └── code/                ← Rust — Ratatui TUI scaffold tool (maschina-code binary)
│
├── docs/                    ← Internal engineering documentation
│   ├── architecture/        ← System, services, data, AI, API, network, repo, workflows
│   ├── development/         ← Local setup, environment, testing, contributing, standards
│   ├── operations/          ← Deployment, CI/CD, observability, scaling, recovery
│   └── security/            ← Security model, secrets, access control, API security
│
├── docker/                  ← Docker Compose for local development
│   └── docker-compose.yml
│
├── .github/                 ← CI/CD workflows, issue templates, PR templates
├── .husky/                  ← Git hooks (pre-commit, commit-msg)
├── turbo.json               ← Turborepo task graph
├── pnpm-workspace.yaml      ← pnpm workspace config
├── biome.json               ← Biome linting + formatting config
├── commitlint.config.js     ← Conventional Commits enforcement
└── CLAUDE.md                ← Claude Code session context
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
{ "dependencies": { "@maschina/database": "workspace:*" } }
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
pnpm build              # build all packages and services (respects dep graph)
pnpm build --filter=@maschina/api    # build only api + its deps
pnpm typecheck          # type-check all TypeScript packages
pnpm lint               # Biome lint across all TS packages
pnpm test               # run all test suites
```

---

## Shared Packages

### `apps/developers`

The developer portal — a separate React app (Vite + TanStack Router) for external developers building on top of the Maschina platform.

| Section | Path | Purpose |
|---|---|---|
| Auth | `developers/auth/` | Registration, login, email verification for developer accounts |
| Dashboard | `developers/` | API key management, webhook registration, usage analytics |
| Admin | `developers/admin/` | Maschina team internal tools — user management, billing ops, feature flags |

`admin/` is route-gated behind the `Internal` plan tier. Regular developers see it as a 403.

---

### TypeScript packages (`packages/*`)

All TypeScript packages follow the same structure:

```
packages/auth/
  src/
    index.ts          ← public exports
    *.ts              ← implementation files
  package.json        ← name: "@maschina/auth"
  tsconfig.json       ← extends root tsconfig
```

Packages export via `"exports"` in `package.json` using the `./dist/index.js` convention. Turborepo's build step compiles each package before dependents run.

### Python packages (`packages/runtime`, `packages/agents`, `packages/risk`)

```
packages/runtime/
  src/
    maschina_runtime/
      __init__.py
      runner.py
      tools.py
      models.py
  pyproject.toml       ← name: "maschina-runtime"
  uv.lock
```

Python packages are installed as editable installs (`uv pip install -e .`) in `services/runtime`'s virtual environment.

### Rust packages (`packages/cli`, `packages/code`)

```
packages/cli/
  src/
    main.rs
    commands/
    config.rs
    client.rs
  Cargo.toml           ← package name: "maschina-cli"
```

Built with `cargo build --release`. Binaries: `maschina-cli`, `maschina-code`.

---

## Naming Conventions

### Package names

- TypeScript: `@maschina/<name>` (e.g., `@maschina/auth`, `@maschina/database`)
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
import { db } from "@maschina/database/client.js";
```

---

## Build Graph

Critical dependency order (Turborepo enforces this):

```
packages/database
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
  ↓
packages/notifications
packages/email
packages/telemetry
  ↓
services/api
```

Rust and Python packages build independently of the TypeScript graph.
