# Secrets Management

---

## Secret Storage — Doppler

All secrets are stored in **Doppler**. No secrets live in the repository, no secrets are hardcoded in code.

Doppler syncs secrets to:
- Local `.env` files (via `doppler secrets download`)
- Fly.io service secrets
- GitHub Actions secrets
- Docker Compose environment

### Project structure in Doppler

```
Project: maschina
  Config: dev       ← Local development
  Config: staging   ← Staging environment
  Config: prd       ← Production
```

### Doppler CLI usage

```bash
# Pull secrets to .env
doppler secrets download --no-file --format env > services/api/.env

# Run a command with injected secrets
doppler run -- pnpm dev

# Set a secret
doppler secrets set JWT_SECRET="..."

# List all secrets (values hidden)
doppler secrets
```

---

## Secret Inventory

### Shared across all services

| Secret | Description |
|---|---|
| `JWT_SECRET` | HS256 signing key — shared by gateway, api, realtime |

### services/api

| Secret | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `NATS_URL` | NATS server URL |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_*` | Stripe price IDs per plan/period |
| `RESEND_API_KEY` | Resend transactional email key |
| `MEILISEARCH_API_KEY` | Meilisearch admin key |
| `SENTRY_DSN` | Sentry DSN |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Grafana Tempo OTLP endpoint |

### services/daemon

| Secret | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `NATS_URL` | NATS server URL |
| `RUNTIME_URL` | Internal URL of services/runtime |
| `SENTRY_DSN` | Sentry DSN |

### services/runtime

| Secret | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `LANGSMITH_API_KEY` | LangSmith tracing key |
| `WANDB_API_KEY` | Weights & Biases key |
| `QDRANT_URL` | Qdrant server URL |
| `QDRANT_API_KEY` | Qdrant API key |
| `SENTRY_DSN` | Sentry DSN |

### CI/CD (GitHub Actions)

| Secret | Description |
|---|---|
| `FLY_API_TOKEN` | Fly.io deploy token |
| `NEON_API_KEY` | Neon API key for branch management |
| `GHCR_TOKEN` | GitHub Container Registry push token |
| `DOPPLER_TOKEN` | Doppler service token for secret sync |

---

## Credential Rotation

### Regular rotation schedule

| Credential | Rotation | How |
|---|---|---|
| `JWT_SECRET` | Every 90 days | Update in Doppler, sync to all services, restart |
| `ANTHROPIC_API_KEY` | On compromise or 180 days | Rotate in Anthropic console, update Doppler |
| `STRIPE_SECRET_KEY` | On compromise | Rotate in Stripe dashboard, update Doppler |
| `RESEND_API_KEY` | On compromise | Rotate in Resend dashboard, update Doppler |
| Database passwords | On compromise or 180 days | Neon console, update `DATABASE_URL` in Doppler |
| Redis password | On compromise | Update in Redis config + Doppler |

### JWT_SECRET rotation procedure

Rotating `JWT_SECRET` invalidates all existing JWTs. All users are logged out.

1. Generate a new 64-char random secret: `openssl rand -hex 32`
2. Update in Doppler: `doppler secrets set JWT_SECRET="<new>"`
3. Sync to all services: `fly secrets set JWT_SECRET="<new>" -a maschina-gateway maschina-api maschina-realtime`
4. Restart all services: `fly apps restart maschina-gateway; fly apps restart maschina-api; fly apps restart maschina-realtime`
5. All users re-authenticate on next request

### API key rotation (user-initiated)

Users rotate their own API keys via `DELETE /api-keys/:id` (revoke old) + `POST /api-keys` (issue new). The old key is invalidated immediately on revocation.

---

## Secret Hygiene Rules

- Never hardcode secrets in source code
- Never commit `.env` files — they are gitignored
- Never log secrets, tokens, or password hashes
- Never pass secrets as command-line arguments (visible in process list)
- Never share secrets via Slack, email, or chat
- Use `doppler run --` to inject secrets into local commands rather than exporting to shell
