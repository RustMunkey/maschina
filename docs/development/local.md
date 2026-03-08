# Local Development

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 22+ | `nvm install 22` |
| pnpm | 9+ | `npm install -g pnpm` |
| Rust | 1.82+ | `rustup update stable` |
| Python | 3.12+ | `pyenv install 3.12` |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh | sh` |
| Docker | 24+ | Docker Desktop or OrbStack |
| Docker Compose | v2 | Included with Docker Desktop |

---

## First-Time Setup

### 1. Clone and install

```bash
git clone git@github.com:RustMunkey/maschina.git
cd maschina
pnpm install
```

### 2. Copy environment files

```bash
cp services/api/.env.example services/api/.env
cp services/gateway/.env.example services/gateway/.env
cp services/daemon/.env.example services/daemon/.env
cp services/realtime/.env.example services/realtime/.env
cp services/runtime/.env.example services/runtime/.env
```

Fill in the required values. See `docs/development/environment.md` for the full variable reference.

### 3. Start infrastructure

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts: PostgreSQL, Redis, NATS, Meilisearch, Qdrant, Temporal, Temporal UI, Grafana, Prometheus, Loki.

### 4. Run database migrations

```bash
pnpm db:generate
pnpm db:migrate
```

### 5. Build Rust services

```bash
cargo build
```

### 6. Set up Python packages

```bash
cd packages/runtime && uv pip install -e . && cd ../..
cd packages/agents && uv pip install -e . && cd ../..
cd packages/risk && uv pip install -e . && cd ../..
cd services/runtime && uv pip install -e . && cd ../..
```

Or with a helper script:

```bash
./scripts/setup-python.sh
```

---

## Running the Stack

### All services (recommended)

```bash
pnpm dev
```

Turborepo starts all services in parallel with dependency order:
- `services/api` — `pnpm dev` (tsx watch)
- `services/gateway` — `cargo run`
- `services/daemon` — `cargo run`
- `services/realtime` — `cargo run`
- `services/runtime` — `uvicorn main:app --reload`

### Individual services

```bash
# TypeScript API
cd services/api && pnpm dev

# Rust gateway
cd services/gateway && cargo run

# Rust daemon
cd services/daemon && cargo run

# Rust realtime
cd services/realtime && cargo run

# Python runtime
cd services/runtime && uvicorn main:app --reload --port 8001
```

---

## Docker Environment

The `docker/docker-compose.yml` provides all stateful dependencies.

### Services

| Service | Port | UI |
|---|---|---|
| PostgreSQL | 5432 | — |
| Redis | 6379 | — |
| NATS | 4222, 8222 (monitoring) | `http://localhost:8222` |
| Meilisearch | 7700 | `http://localhost:7700` |
| Qdrant | 6333 (REST), 6334 (gRPC) | `http://localhost:6333/dashboard` |
| Temporal | 7233 | — |
| Temporal UI | 8088 | `http://localhost:8088` |
| Grafana | 3001 | `http://localhost:3001` |
| Prometheus | 9091 | `http://localhost:9091` |
| Loki | 3100 | — (via Grafana) |

### Common commands

```bash
# Start all
docker compose -f docker/docker-compose.yml up -d

# Stop all (preserve data)
docker compose -f docker/docker-compose.yml stop

# Destroy all (including volumes)
docker compose -f docker/docker-compose.yml down -v

# View logs
docker compose -f docker/docker-compose.yml logs -f nats
docker compose -f docker/docker-compose.yml logs -f postgres
```

---

## Database

### Local dialect

Set `DATABASE_URL=file:./local.db` in `services/api/.env` to use SQLite locally. No PostgreSQL container required for TypeScript API development.

Set `DATABASE_URL=postgresql://maschina:maschina@localhost:5432/maschina` to use the local PostgreSQL container.

### Migrations

```bash
pnpm db:generate        # generate migration from schema changes
pnpm db:migrate         # apply pending migrations
pnpm db:push            # push schema directly, no migration file (dev only)
pnpm db:studio          # open Drizzle Studio (local DB browser)
pnpm db:seed            # seed with dev fixtures
```

---

## Useful Ports

| Service | Port |
|---|---|
| Gateway | `http://localhost:8080` |
| API | `http://localhost:3000` |
| Daemon health | `http://localhost:9090/health` |
| Realtime | `http://localhost:4000` |
| Runtime | `http://localhost:8001` |

---

## Troubleshooting

**NATS not connecting** — ensure Docker containers are up: `docker compose -f docker/docker-compose.yml ps`

**Cargo build fails** — run `rustup update stable` and retry

**Python import errors** — ensure packages are installed as editable: `uv pip install -e packages/runtime`

**Migration error** — check `DATABASE_URL` is set correctly; run `pnpm db:push` for a clean dev reset

**Port conflicts** — check nothing else is on 8080, 3000, 4000, 8001, 4222
