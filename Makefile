## Maschina — Local development, testing, and operations
##
## First time:                 make install && cp .env.local.example .env.local (edit it)
## Start everything:           make dev  (or ./dev.sh)
## Infrastructure (Docker):    make up / make down / make reset
## Backend services (Docker):  make services-up / make services-down
## Dev mode (hot reload):      make dev-api / make dev-daemon / etc.
## Testing:                    make test / make test-ts / make test-rust / make test-python
## Database:                   make db-migrate / make db-seed / make db-studio
## Health checks:              make health / make dev-status
## Build:                      make build / make clean
## CI simulation:              make ci

COMPOSE      := docker compose -f docker/docker-compose.yml
COMPOSE_ALL  := docker compose -f docker/docker-compose.yml -f docker/docker-compose.services.yml

# ─── Colors ───────────────────────────────────────────────────────────────────
BOLD  := \033[1m
GREEN := \033[32m
CYAN  := \033[36m
RESET := \033[0m

.PHONY: dev
dev: ## Start full local stack (infra + all services) — first run: make install && cp .env.local.example .env.local
	./dev.sh

.PHONY: dev-stop
dev-stop: ## Stop all background services started by ./dev.sh
	./dev.sh stop

.PHONY: dev-status
dev-status: ## Show health of all running services
	./dev.sh status

.PHONY: dev-logs
dev-logs: ## Tail all service logs
	./dev.sh logs

.PHONY: help
help: ## Show this help
	@printf '$(BOLD)Maschina$(RESET)\n\n'
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  $(CYAN)%-22s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ─────────────────────────────────────────────────────────────────────────────
# INFRASTRUCTURE (Docker — postgres, redis, nats, meilisearch, qdrant, temporal)
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: up
up: ## Start all infrastructure services (detached)
	$(COMPOSE) up -d
	@printf '$(GREEN)Infrastructure up$(RESET)\n'
	@printf '  Postgres:    localhost:5432\n'
	@printf '  Redis:       localhost:6379\n'
	@printf '  NATS:        localhost:4222  (monitor: localhost:8222)\n'
	@printf '  Meilisearch: localhost:7700\n'
	@printf '  Qdrant:      localhost:6333\n'
	@printf '  Temporal:    localhost:7233  (UI: localhost:8088)\n'

.PHONY: down
down: ## Stop all infrastructure services
	$(COMPOSE) down

.PHONY: ps
ps: ## Show running container status
	$(COMPOSE) ps

.PHONY: logs
logs: ## Tail logs from all infrastructure containers
	$(COMPOSE) logs -f

.PHONY: logs-%
logs-%: ## Tail logs for a specific service (e.g. make logs-postgres)
	$(COMPOSE) logs -f $*

.PHONY: reset
reset: ## Full wipe — stop, remove volumes, restart fresh
	$(COMPOSE) down -v
	$(COMPOSE) up -d
	@printf '$(GREEN)Infrastructure reset complete$(RESET)\n'

# ─────────────────────────────────────────────────────────────────────────────
# FULL STACK (Docker — infra + all 6 backend services)
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: services-up
services-up: ## Build + start infra and all backend services in Docker
	$(COMPOSE_ALL) up -d --build
	@printf '$(GREEN)Full stack up$(RESET)\n'
	@printf '  API:      http://localhost:3000\n'
	@printf '  Gateway:  http://localhost:8080\n'
	@printf '  Realtime: http://localhost:4000\n'
	@printf '  Runtime:  http://localhost:8001\n'

.PHONY: services-down
services-down: ## Stop infra and all backend services
	$(COMPOSE_ALL) down

.PHONY: services-build
services-build: ## Build all service Docker images without starting
	$(COMPOSE_ALL) build

.PHONY: services-logs
services-logs: ## Tail logs from all services
	$(COMPOSE_ALL) logs -f

# ─────────────────────────────────────────────────────────────────────────────
# DEV MODE (hot reload — run each in a separate terminal)
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: dev-api
dev-api: ## Start API in dev mode (tsx watch, hot reload)
	pnpm --filter @maschina/chain build
	cd services/api && pnpm dev

.PHONY: dev-gateway
dev-gateway: ## Start Gateway in dev mode (cargo run)
	cd services/gateway && cargo run

.PHONY: dev-realtime
dev-realtime: ## Start Realtime in dev mode (cargo run)
	cd services/realtime && cargo run

.PHONY: dev-daemon
dev-daemon: ## Start Daemon in dev mode (cargo run)
	cd services/daemon && cargo run

.PHONY: dev-runtime
dev-runtime: ## Start Runtime in dev mode (uvicorn --reload)
	cd services/runtime && uvicorn src.main:app --reload --host 0.0.0.0 --port 8001

.PHONY: dev-worker
dev-worker: ## Start Worker in dev mode (install first: uv pip install -e services/worker)
	cd services/worker && python -m worker.main

# ─── APP DEV (web apps — each needs its own terminal) ────────────────────────

.PHONY: dev-app
dev-app: ## Start main app (React + Vite, apps/app)
	pnpm run app

.PHONY: dev-web
dev-web: ## Start marketing web (apps/web)
	pnpm run web

.PHONY: dev-console
dev-console: ## Start console app (apps/console)
	pnpm run console

.PHONY: dev-admin
dev-admin: ## Start admin app (apps/admin)
	pnpm --filter @maschina/admin dev

.PHONY: dev-auth
dev-auth: ## Start auth app (apps/auth)
	pnpm --filter @maschina/auth-app dev

.PHONY: dev-docs
dev-docs: ## Start docs (Mintlify, apps/docs)
	pnpm run doc

.PHONY: dev-desktop
dev-desktop: ## Start desktop app (Tauri 2)
	pnpm run desktop

# ─────────────────────────────────────────────────────────────────────────────
# INSTALL
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: install
install: ## Install all dependencies (pnpm + cargo + uv)
	pnpm install
	pnpm rebuild better-sqlite3
	cargo fetch
	uv pip install pytest pytest-asyncio pytest-cov respx httpx
	uv pip install -e packages/runtime -e packages/agents -e packages/risk -e packages/ml \
	  -e packages/model -e packages/sdk/python -e services/runtime -e services/worker
	pnpm --filter @maschina/chain build

# ─────────────────────────────────────────────────────────────────────────────
# BUILD
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: build
build: ## Build everything (TypeScript + Rust release + Python wheels)
	pnpm build
	cargo build --release

.PHONY: build-ts
build-ts: ## Build all TypeScript packages and services (excludes apps/* and Rust/Python services)
	pnpm turbo build --filter='./packages/*' --filter='@maschina/api' --filter='@maschina/analytics' --filter='@maschina/email'

.PHONY: build-rust
build-rust: ## Build all Rust services and packages (release)
	cargo build --release

.PHONY: build-app
build-app: ## Build main app for production
	pnpm run build:app

.PHONY: build-web
build-web: ## Build marketing web for production
	pnpm run build:web

.PHONY: build-console
build-console: ## Build console for production
	pnpm run build:console

.PHONY: build-desktop
build-desktop: ## Build desktop app (Tauri 2)
	pnpm run build:desktop

.PHONY: clean
clean: ## Remove all build artifacts
	pnpm clean
	cargo clean
	find . -type d -name __pycache__ -not -path '*/node_modules/*' | xargs rm -rf
	find . -name '*.pyc' -not -path '*/node_modules/*' -delete

# ─────────────────────────────────────────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: db-migrate
db-migrate: ## Run Drizzle migrations against local Postgres
	cd packages/db && pnpm db:migrate

.PHONY: db-push
db-push: ## Push schema directly to DB (dev only — skips migration files)
	cd packages/db && pnpm db:push

.PHONY: db-seed
db-seed: ## Seed the local database with development data (add packages/db/src/seed.ts to enable)
	pnpm --filter @maschina/db exec tsx src/seed.ts

.PHONY: db-generate
db-generate: ## Generate Drizzle migration files from schema changes
	cd packages/db && pnpm db:generate

.PHONY: db-studio
db-studio: ## Open Drizzle Studio (database GUI)
	cd packages/db && pnpm db:studio

.PHONY: db-reset
db-reset: ## Wipe and re-migrate the local database (destructive)
	$(COMPOSE) down -v postgres
	$(COMPOSE) up -d postgres
	@printf 'Waiting for Postgres...\n'
	@sleep 3
	$(MAKE) db-migrate

# ─────────────────────────────────────────────────────────────────────────────
# TESTING
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: test
test: ## Run all tests (TS + Rust + Python)
	$(MAKE) test-ts
	$(MAKE) test-rust
	$(MAKE) test-python

.PHONY: test-ts
test-ts: ## Run all TypeScript tests (Vitest)
	pnpm test

.PHONY: test-rust
test-rust: ## Run all Rust tests
	cargo test

.PHONY: test-python
test-python: ## Run all Python tests (pytest)
	python -m pytest packages/runtime/tests packages/agents/tests packages/risk/tests \
	  packages/sdk/python/tests services/runtime/tests -v

.PHONY: test-runtime
test-runtime: ## Test Python runtime package only
	python -m pytest packages/runtime/tests -v

.PHONY: test-agents
test-agents: ## Test agents package only
	python -m pytest packages/agents/tests -v

.PHONY: test-risk
test-risk: ## Test risk package only
	python -m pytest packages/risk/tests -v

.PHONY: test-ml
test-ml: ## Test ML package only
	python -m pytest packages/ml/tests -v

.PHONY: test-worker
test-worker: ## Test worker service only
	python -m pytest services/worker/tests -v

.PHONY: test-api
test-api: ## Test API service only (Vitest)
	pnpm --filter @maschina/api test

.PHONY: test-integration
test-integration: ## Run integration tests (requires infra running)
	pnpm --filter @maschina/tests test:integration

.PHONY: test-e2e
test-e2e: ## Run E2E smoke tests (requires full stack running)
	RUN_E2E=true pnpm --filter @maschina/tests test:e2e

.PHONY: test-watch
test-watch: ## Run TypeScript tests in watch mode
	pnpm --filter '*' test --watch

.PHONY: test-coverage
test-coverage: ## Run TypeScript tests with coverage report
	pnpm --filter '*' test --coverage

# ─────────────────────────────────────────────────────────────────────────────
# LINT + TYPECHECK
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: lint
lint: ## Lint TypeScript (Biome), Rust (clippy), Python (Ruff)
	pnpm lint
	cargo clippy -- -D warnings
	ruff check packages/ services/

.PHONY: format
format: ## Format TypeScript (Biome), Rust (cargo fmt), Python (Ruff)
	pnpm format
	cargo fmt
	ruff format packages/ services/

.PHONY: typecheck
typecheck: ## TypeScript type check only
	pnpm typecheck

# ─────────────────────────────────────────────────────────────────────────────
# HEALTH CHECKS
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: health
health: ## Check health of all running backend services
	@printf '$(BOLD)Service health checks$(RESET)\n'
	@curl -sf http://localhost:3000/health  > /dev/null && printf '  $(GREEN)✓$(RESET) API       http://localhost:3000\n'  || printf '  ✗ API       not reachable\n'
	@curl -sf http://localhost:8080/health  > /dev/null && printf '  $(GREEN)✓$(RESET) Gateway   http://localhost:8080\n'  || printf '  ✗ Gateway   not reachable\n'
	@curl -sf http://localhost:4000/health  > /dev/null && printf '  $(GREEN)✓$(RESET) Realtime  http://localhost:4000\n'  || printf '  ✗ Realtime  not reachable\n'
	@curl -sf http://localhost:8001/health  > /dev/null && printf '  $(GREEN)✓$(RESET) Runtime   http://localhost:8001\n'  || printf '  ✗ Runtime   not reachable\n'
	@curl -sf http://localhost:7700/health  > /dev/null && printf '  $(GREEN)✓$(RESET) Meili     http://localhost:7700\n'  || printf '  ✗ Meili     not reachable\n'
	@curl -sf http://localhost:6333/readyz  > /dev/null && printf '  $(GREEN)✓$(RESET) Qdrant    http://localhost:6333\n'  || printf '  ✗ Qdrant    not reachable\n'
	@curl -sf http://localhost:8222/healthz > /dev/null && printf '  $(GREEN)✓$(RESET) NATS      http://localhost:8222\n'  || printf '  ✗ NATS      not reachable\n'

# ─────────────────────────────────────────────────────────────────────────────
# CI SIMULATION
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: ci
ci: ## Simulate full CI pipeline locally (all 10 jobs)
	@printf '$(BOLD)Running CI simulation$(RESET)\n'
	@printf '\n$(CYAN)[1/10] TS typecheck$(RESET)\n'
	pnpm --filter @maschina/chain build
	pnpm typecheck
	@printf '\n$(CYAN)[2/10] TS lint (Biome)$(RESET)\n'
	pnpm lint
	@printf '\n$(CYAN)[3/10] TS test$(RESET)\n'
	pnpm test
	@printf '\n$(CYAN)[4/10] Rust fmt$(RESET)\n'
	cargo fmt --check
	@printf '\n$(CYAN)[5/10] Rust clippy$(RESET)\n'
	cargo clippy -- -D warnings
	@printf '\n$(CYAN)[6/10] Rust test$(RESET)\n'
	cargo test
	@printf '\n$(CYAN)[7/10] Rust build (release)$(RESET)\n'
	cargo build --release
	@printf '\n$(CYAN)[8/10] Python lint (Ruff)$(RESET)\n'
	ruff check packages/ services/
	@printf '\n$(CYAN)[9/10] Python test$(RESET)\n'
	python -m pytest packages/runtime/tests packages/agents/tests packages/risk/tests \
	  packages/sdk/python/tests services/runtime/tests
	@printf '\n$(GREEN)$(BOLD)[10/10] CI gate passed$(RESET)\n'

# ─────────────────────────────────────────────────────────────────────────────
# MISC
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: open
open: ## Open local service UIs in browser
	open http://localhost:8088   # Temporal UI
	open http://localhost:7700   # Meilisearch dashboard
	open http://localhost:3000   # API
	open http://localhost:8080   # Gateway

.PHONY: cli
cli: ## Run the maschina CLI (dev build)
	cargo run -p maschina-cli --

.PHONY: code
code: ## Run the maschina code TUI tool (dev build)
	cargo run -p maschina-code --

.PHONY: versions
versions: ## Print tool versions
	@node --version
	@pnpm --version
	@rustc --version
	@cargo --version
	@python3 --version
	@uv --version
