# Environment Configuration

---

## Secret Management

All secrets are stored in **Doppler**. In production, Doppler syncs secrets to Fly.io secrets and CI environment variables. Locally, secrets are pulled to `.env` files via:

```bash
doppler secrets download --no-file --format env > services/api/.env
```

Never commit `.env` files. They are gitignored.

---

## services/api

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | `file:./local.db` (SQLite) or `postgresql://...` (PG) |
| `REDIS_URL` | Yes | `redis://localhost:6379` |
| `NATS_URL` | Yes | `nats://localhost:4222` |
| `JWT_SECRET` | Yes | HS256 signing secret — min 32 chars, random |
| `JWT_EXPIRES_IN` | No | Token TTL, default `7d` |
| `STRIPE_SECRET_KEY` | Yes (billing) | `sk_test_*` or `sk_live_*` |
| `STRIPE_WEBHOOK_SECRET` | Yes (billing) | Stripe webhook signing secret |
| `STRIPE_PRICE_M1_MONTHLY` | Yes (billing) | Stripe price ID for M1 monthly |
| `STRIPE_PRICE_M1_YEARLY` | Yes (billing) | Stripe price ID for M1 yearly |
| `STRIPE_PRICE_M5_MONTHLY` | Yes (billing) | Stripe price ID for M5 monthly |
| `STRIPE_PRICE_M5_YEARLY` | Yes (billing) | Stripe price ID for M5 yearly |
| `STRIPE_PRICE_M10_MONTHLY` | Yes (billing) | Stripe price ID for M10 monthly |
| `STRIPE_PRICE_M10_YEARLY` | Yes (billing) | Stripe price ID for M10 yearly |
| `STRIPE_PRICE_TEAM_MONTHLY` | Yes (billing) | Stripe price ID for Mach Team monthly |
| `STRIPE_PRICE_TEAM_YEARLY` | Yes (billing) | Stripe price ID for Mach Team yearly |
| `RESEND_API_KEY` | No | Resend API key — email is no-op without this |
| `MEILISEARCH_URL` | No | `http://localhost:7700` |
| `MEILISEARCH_API_KEY` | No | Meilisearch admin key |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | Grafana Tempo endpoint |
| `OTEL_SERVICE_NAME` | No | Default `maschina-api` |
| `SENTRY_DSN` | No | Sentry DSN for error tracking |
| `PORT` | No | Default `3000` |

---

## services/gateway

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Must match `services/api` exactly |
| `API_UPSTREAM` | Yes | `http://localhost:3000` |
| `REALTIME_UPSTREAM` | Yes | `http://localhost:4000` |
| `CORS_ORIGIN` | Yes | Allowed origin, e.g. `http://localhost:5173` |
| `PORT` | No | Default `8080` |

---

## services/daemon

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL URL (daemon requires PG — no SQLite) |
| `REDIS_URL` | Yes | Redis URL for quota checks |
| `NATS_URL` | Yes | NATS server URL |
| `RUNTIME_URL` | Yes | `http://localhost:8001` |
| `AGENT_TIMEOUT_SECS` | No | Per-run timeout in seconds, default `300` |
| `MAX_CONCURRENCY` | No | Semaphore size for parallel jobs, default `10` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | Grafana Tempo endpoint |
| `SENTRY_DSN` | No | Sentry DSN |

---

## services/realtime

| Variable | Required | Description |
|---|---|---|
| `NATS_URL` | Yes | NATS server URL |
| `JWT_SECRET` | Yes | For `?token=` direct JWT connections |
| `PORT` | No | Default `4000` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | Grafana Tempo endpoint |

---

## services/runtime

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `LANGSMITH_API_KEY` | No | LangSmith tracing — disabled if not set |
| `LANGSMITH_PROJECT` | No | LangSmith project name, default `maschina` |
| `WANDB_API_KEY` | No | Weights & Biases — disabled if not set |
| `QDRANT_URL` | No | `http://localhost:6333` |
| `QDRANT_API_KEY` | No | Qdrant API key (production) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | Grafana Tempo endpoint |
| `SENTRY_DSN` | No | Sentry DSN |
| `PORT` | No | Default `8001` |

---

## Shared Conventions

### JWT_SECRET

All services that validate JWTs must share the same `JWT_SECRET`. In Doppler, this is a single secret synced to all services. Locally, copy the same value to each service's `.env`.

### DATABASE_URL dialect detection

```
file:./local.db          → SQLite (local dev, api only)
postgresql://user:pass@host:5432/db  → PostgreSQL
postgres://user:pass@host:5432/db    → PostgreSQL (alias)
```

### Optional services

Services with optional external integrations (Resend, LangSmith, Sentry, OTEL) degrade gracefully when the key is not set. Email sending is a no-op, tracing is disabled, error reports are skipped.

---

## Doppler Setup

```bash
# Install Doppler CLI
brew install dopplerhq/cli/doppler

# Authenticate
doppler login

# Link project
doppler setup --project maschina --config dev

# Pull secrets to .env
doppler secrets download --no-file --format env > services/api/.env

# Or run a command with secrets injected
doppler run -- pnpm dev
```

---

## Local .env Template

A minimal local `.env` for `services/api` without external dependencies:

```env
DATABASE_URL=file:./local.db
REDIS_URL=redis://localhost:6379
NATS_URL=nats://localhost:4222
JWT_SECRET=local-dev-secret-minimum-32-chars-long
PORT=3000
```

Stripe, Resend, LangSmith, and Sentry can be omitted locally — those integrations no-op gracefully.
