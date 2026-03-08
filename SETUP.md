# Maschina — Dev Setup

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node | ≥ 20 | `brew install node` |
| pnpm | ≥ 10 | `npm i -g pnpm` |
| Rust | stable | `curl https://sh.rustup.rs -sSf \| sh` |
| Python | 3.12 | `brew install python@3.12` |
| Docker Desktop | latest | docker.com |
| Ollama | latest | `brew install ollama` |

---

## One-time setup

```bash
# 1. Install JS deps
pnpm install

# 2. Build Rust
cargo build --workspace

# 3. Start infrastructure (Postgres, Redis, NATS, Meilisearch, Qdrant, Temporal)
pnpm docker:up

# 4. Run DB migrations (wait ~5s for Postgres to be healthy first)
pnpm --filter @maschina/db run db:generate
pnpm --filter @maschina/db run db:migrate

# 5. Python venv — services/runtime
cd services/runtime
python3 -m venv .venv
source .venv/bin/activate
pip install -e ../../packages/runtime
pip install -e ../../packages/risk
pip install -e .
deactivate && cd ../..

# 6. Python venv — services/worker
cd services/worker
python3 -m venv .venv
source .venv/bin/activate
pip install -e ../../packages/runtime
pip install -e ../../packages/agents
pip install -e ../../packages/risk
pip install -e ../../packages/ml
pip install -e .
deactivate && cd ../..

# 7. Copy env files and fill in secrets
cp services/api/.env.example services/api/.env
cp services/daemon/.env.example services/daemon/.env
cp services/gateway/.env.example services/gateway/.env
cp services/realtime/.env.example services/realtime/.env
cp services/runtime/.env.example services/runtime/.env
# ANTHROPIC_API_KEY in services/runtime/.env — leave blank to use Ollama

# 8. Start Ollama (if no Anthropic key)
ollama serve          # in a separate terminal
ollama pull llama3.2
```

---

## Running services (each in its own terminal)

```bash
# TypeScript API
pnpm api

# Python runtime (agent execution)
pnpm runtime

# Python worker (background jobs)
pnpm worker

# Rust daemon (job orchestration)
pnpm daemon

# Rust gateway (auth + rate limiting proxy)
pnpm gateway

# Rust realtime (WebSocket/SSE fan-out)
pnpm realtime
```

---

## Smoke test

```bash
# Health checks
curl http://localhost:8080/health   # API
curl http://localhost:8001/health   # Runtime

# Run an agent via runtime directly
curl -s -X POST http://localhost:8001/run -H "Content-Type: application/json" \
  -d '{"run_id":"test-1","agent_id":"a","user_id":"u","plan_tier":"access","system_prompt":"You are a helpful assistant.","input_payload":{"message":"Say hello."}}' \
  | python3 -m json.tool
```

---

## DB

```bash
pnpm --filter @maschina/db run db:generate   # generate migration
pnpm --filter @maschina/db run db:migrate    # apply migration
pnpm --filter @maschina/db run db:studio     # open DB browser
```

---

## CLI (after API is running)

```bash
maschina setup            # interactive first-time wizard
maschina status           # check connection and account
maschina agent list
maschina keys create dev
maschina service start    # start all background services
```
