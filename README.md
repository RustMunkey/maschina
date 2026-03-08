# Maschina

Infrastructure for autonomous digital labor. A modular framework for deploying networks of AI agents that continuously discover, evaluate, and execute digital opportunities.

> **Status:** Pre-development — active scaffolding. MVP targeted Q2 2026.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend / tooling | TypeScript, React, Tauri |
| Backend API | TypeScript (Hono) |
| Agent runtime | Python (FastAPI, Celery) |
| ML / RL | Python (PyTorch, Stable-Baselines3, Gymnasium) |
| Daemon / CLI / Desktop / Mobile | Rust, Tauri 2 |
| Database | PostgreSQL (prod) / SQLite (local) via Drizzle |
| Queue | Redis + Celery |
| Monorepo | pnpm + Turborepo |
| Formatting / Linting | Biome (TS), Clippy (Rust) |
| Testing | Vitest (TS), cargo test (Rust), pytest (Python) |

---

## Prerequisites

- [Node.js](https://nodejs.org) >= 20
- [pnpm](https://pnpm.io) >= 10 — `npm install -g pnpm`
- [Rust](https://rustup.rs) stable toolchain
- [Python](https://python.org) >= 3.12 + [uv](https://github.com/astral-sh/uv)
- [Docker](https://docker.com) (for Postgres + Redis)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) (for desktop/mobile)

---

## Setup

```sh
# 1. Clone
git clone git@github.com:RustMunkey/maschina.git
cd maschina

# 2. Install JS dependencies
pnpm install

# 3. Install git hooks (local CI runs before every push)
pnpm hooks:install

# 4. Install Python dependencies
uv pip install -e packages/runtime -e packages/agents -e packages/ml \
               -e packages/risk -e packages/sdk/python -e services/worker

# 5. Copy env and configure
cp docker/.env.example .env

# 6. Start infrastructure (Postgres + Redis)
pnpm docker:dev

# 7. Push DB schema
pnpm db:push
```

---

## Commands

Everything runs from root via `pnpm`. No Makefiles, no exceptions.
Native tools (`cargo`, `pytest`, etc.) still work as normal — pnpm commands are convenience wrappers on top.

### Global

| Command | Description |
|---------|-------------|
| `pnpm build` | Build everything |
| `pnpm dev` | Dev all apps and services in parallel |
| `pnpm test` | Run all tests (TS + Rust + Python) |
| `pnpm check` | Biome lint + format check (TypeScript / JSON) |
| `pnpm format` | Biome format with auto-fix |
| `pnpm clean` | Clean all build outputs |

### Start a process (dev mode)

| Command | Description |
|---------|-------------|
| `pnpm app` | Operator dashboard |
| `pnpm web` | Marketing site |
| `pnpm doc` | Documentation site |
| `pnpm console` | Terminal UI |
| `pnpm desktop` | Tauri desktop app |
| `pnpm mobile` | Tauri mobile app |
| `pnpm api` | Backend API |
| `pnpm daemon` | Rust orchestrator daemon |
| `pnpm worker` | Python Celery worker |
| `pnpm cli` | Maschina CLI (dev mode) |
| `pnpm code` | Maschina Code tool (dev mode) |

### Build

| Command | Description |
|---------|-------------|
| `pnpm build:app` | Build operator dashboard |
| `pnpm build:web` | Build marketing site |
| `pnpm build:doc` | Build documentation site |
| `pnpm build:console` | Build terminal UI |
| `pnpm build:desktop` | Build Tauri desktop app |
| `pnpm build:mobile` | Build Tauri mobile app |
| `pnpm build:api` | Build backend API |
| `pnpm build:daemon` | Build Rust daemon |
| `pnpm build:worker` | Build Python worker |
| `pnpm build:cli` | Build Maschina CLI |
| `pnpm build:code` | Build Maschina Code tool |
| `pnpm build:types` | Build shared TS types |
| `pnpm build:core` | Build core pipeline primitives |
| `pnpm build:ui` | Build shared component library |
| `pnpm build:sdk` | Build TypeScript agent SDK |
| `pnpm build:config` | Build shared config schemas |
| `pnpm build:content` | Build brand/copy content package |
| `pnpm build:telemetry` | Build telemetry/audit package |
| `pnpm build:db` | Build database package |
| `pnpm build:risk` | Build Python risk engine |
| `pnpm build:runtime` | Build Python pipeline runtime |
| `pnpm build:agents` | Build Python agent implementations |
| `pnpm build:ml` | Build Python ML/RL package |
| `pnpm build:packages` | Build all packages only |
| `pnpm build:rust` | Build all Rust crates (release) |

### Test

| Command | Description |
|---------|-------------|
| `pnpm test:app` | Test operator dashboard |
| `pnpm test:web` | Test marketing site |
| `pnpm test:console` | Test terminal UI |
| `pnpm test:api` | Test backend API |
| `pnpm test:daemon` | Test Rust daemon |
| `pnpm test:worker` | Test Python worker |
| `pnpm test:cli` | Test Maschina CLI |
| `pnpm test:code` | Test Maschina Code tool |
| `pnpm test:types` | Test shared TS types |
| `pnpm test:core` | Test core pipeline package |
| `pnpm test:ui` | Test UI component library |
| `pnpm test:sdk` | Test TypeScript SDK |
| `pnpm test:sdk-py` | Test Python SDK |
| `pnpm test:config` | Test config package |
| `pnpm test:content` | Test content package |
| `pnpm test:telemetry` | Test telemetry package |
| `pnpm test:db` | Test database package |
| `pnpm test:risk` | Test Python risk engine |
| `pnpm test:runtime` | Test Python runtime |
| `pnpm test:agents` | Test Python agents |
| `pnpm test:ml` | Test Python ML/RL package |
| `pnpm test:rust` | Run all Rust tests (`cargo test --workspace`) |
| `pnpm tests` | Run all tests in the root `tests/` folder |
| `pnpm test:e2e` | Run end-to-end tests |
| `pnpm test:integration` | Run integration tests |
| `pnpm test:load` | Run load tests |

### Rust (pnpm wrappers — `cargo` still works natively)

| Command | Description |
|---------|-------------|
| `pnpm cargo:build` | `cargo build --workspace` |
| `pnpm cargo:build:release` | `cargo build --workspace --release` |
| `pnpm cargo:test` | `cargo test --workspace` |
| `pnpm cargo:check` | `cargo check --workspace` |
| `pnpm cargo:clippy` | `cargo clippy --workspace` |
| `pnpm cargo:fmt` | `cargo fmt --all` |
| `pnpm cargo:clean` | `cargo clean` |
| `pnpm cargo:run:daemon` | Run the daemon binary |
| `pnpm cargo:run:cli` | Run the CLI binary |
| `pnpm cargo:run:code` | Run the Code tool binary |
| `pnpm check:rust` | Alias for `cargo clippy --workspace` |

### Python (pnpm wrappers — `pytest` still works natively)

| Command | Description |
|---------|-------------|
| `pnpm pytest` | Run all Python tests across all packages |
| `pnpm pytest:runtime` | Test Python pipeline runtime |
| `pnpm pytest:agents` | Test Python agent implementations |
| `pnpm pytest:ml` | Test ML/RL package |
| `pnpm pytest:risk` | Test risk engine |
| `pnpm pytest:sdk` | Test Python SDK |
| `pnpm pytest:worker` | Test Celery worker service |

### Database

| Command | Description |
|---------|-------------|
| `pnpm db` | Open Drizzle Studio (visual DB browser) |
| `pnpm db:push` | Push schema changes directly (dev) |
| `pnpm db:migrate` | Run migrations (production) |
| `pnpm db:generate` | Generate migration files from schema |

### Docker

| Command | Description |
|---------|-------------|
| `pnpm docker:dev` | Start Postgres + Redis for local dev |
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
| `pnpm ci:e2e` | End-to-end test suite |
| `pnpm ci:integration` | Integration test suite |

### Setup

| Command | Description |
|---------|-------------|
| `pnpm hooks:install` | Activate local CI git hooks (run once after cloning) |

---

## Monorepo structure

```
maschina/
├── apps/                   # User-facing applications
│   ├── app/                # Operator dashboard
│   ├── console/            # Terminal UI
│   ├── desktop/            # Tauri desktop (Rust + web)
│   ├── docs/               # Documentation site
│   ├── mobile/             # Tauri mobile (Rust + web)
│   └── web/                # Marketing site
│
├── services/               # Infrastructure services
│   ├── api/                # Backend API (TypeScript)
│   ├── daemon/             # Orchestrator daemon (Rust)
│   └── worker/             # Agent executor (Python / Celery)
│
├── packages/               # Shared packages
│   ├── agents/             # Agent implementations (Python)
│   ├── assets/             # Brand assets
│   │   └── docs/           # Whitepaper, one-pager
│   ├── cli/                # Maschina CLI + setup wizard (Rust)
│   ├── code/               # Maschina Code dev tool (Rust)
│   ├── config/             # Shared config schemas (TypeScript)
│   ├── content/            # Brand copy, product text (TypeScript)
│   ├── core/               # Agent pipeline primitives (TypeScript)
│   ├── db/                 # Drizzle schema + migrations (TypeScript)
│   ├── ml/                 # ML / RL training, agent evolution (Python)
│   ├── risk/               # Risk engine (Python)
│   ├── runtime/            # Pipeline engine + FastAPI (Python)
│   ├── sdk/
│   │   ├── ts/             # TypeScript agent SDK  (@maschina/sdk)
│   │   ├── python/         # Python agent SDK      (maschina-sdk)
│   │   └── rust/           # Rust traits + types   (@maschina/rust)
│   ├── telemetry/          # Audit logging (TypeScript)
│   ├── tsconfig/           # Shared TypeScript configs
│   ├── types/              # Shared TypeScript types
│   ├── ui/                 # Shared component library
│   └── vitest-config/      # Shared Vitest config
│
├── tests/                  # Root test suites
│   ├── e2e/
│   ├── integration/
│   ├── load/
│   └── scripts/
│
├── docker/                 # Docker compose + service config
│   ├── postgres/
│   └── redis/
│
├── install/                # Curl install script (operators)
├── .github/
│   ├── hooks/              # Local CI git hooks
│   └── workflows/          # GitHub Actions CI
│
├── Cargo.toml              # Rust workspace
├── biome.json              # Formatter + linter (TypeScript)
└── turbo.json              # Turborepo build pipeline
```

---

## Database

Two backends supported, switched via `DATABASE_URL` in `.env`:

**PostgreSQL** (recommended — Docker handles this):
```sh
DATABASE_URL="postgresql://maschina:maschina@localhost:5432/maschina"
pnpm docker:dev
```

**SQLite** (zero-config, no Docker needed):
```sh
DATABASE_URL="file:./dev.db"
# also set dialect to "sqlite" in packages/db/drizzle.config.ts
```

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
