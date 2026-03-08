# API Architecture

---

## Design Principles

- **REST-first** — all endpoints follow RESTful conventions with predictable resource URLs
- **Versioning via path prefix** — all routes are implicitly under `/v1/` semantics; explicit versioning added when breaking changes land
- **Single entry point** — every API call enters via `services/gateway` (port 8080), which proxies to the appropriate upstream
- **Stateless auth** — JWT validation in the gateway requires no database round-trip; API key validation hits the DB once via `services/api`
- **Typed contracts** — request and response shapes are defined using Zod in `packages/schema`; shared across API and frontend

---

## Request Lifecycle

```
Client
  │
  ▼
services/gateway (8080)         ← Public edge — TLS termination, auth, rate limiting
  │  JWT validation (stateless)
  │  API key forwarding
  │  Rate limit check
  │  x-request-id injection
  │
  ▼
services/api (3000)             ← Business logic — route handlers, DB, NATS publish
  │
  ├── PostgreSQL / SQLite        ← Persistent state
  ├── Redis                      ← Quota counters, session store
  ├── NATS JetStream             ← Job dispatch (agent runs, emails)
  └── Meilisearch                ← Index updates on entity changes
```

---

## Endpoint Reference

### Auth — `/auth/*`

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create account (email + password) |
| `POST` | `/auth/login` | Issue JWT + session |
| `POST` | `/auth/logout` | Invalidate session |
| `POST` | `/auth/verify` | Confirm email verification token |
| `POST` | `/auth/resend-verification` | Re-send verification email |
| `POST` | `/auth/forgot-password` | Send password reset link |
| `POST` | `/auth/reset-password` | Apply new password via reset token |
| `GET` | `/auth/me` | Return current authenticated user |

### Users — `/users/*`

| Method | Path | Description |
|---|---|---|
| `GET` | `/users/profile` | Fetch profile |
| `PATCH` | `/users/profile` | Update display name, avatar |
| `PATCH` | `/users/settings` | Update notification preferences, timezone |
| `DELETE` | `/users/account` | Request account deletion |

### Agents — `/agents/*`

| Method | Path | Description |
|---|---|---|
| `GET` | `/agents` | List agents for authenticated user |
| `POST` | `/agents` | Create agent |
| `GET` | `/agents/:id` | Get agent detail |
| `PATCH` | `/agents/:id` | Update agent config |
| `DELETE` | `/agents/:id` | Delete agent |
| `POST` | `/agents/:id/run` | Dispatch agent run (publishes to NATS) |
| `GET` | `/agents/:id/runs` | List run history |
| `GET` | `/agents/:id/runs/:runId` | Get run detail + output |

### API Keys — `/api-keys/*`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api-keys` | List active keys |
| `POST` | `/api-keys` | Issue new key (`msk_live_*` / `msk_test_*`) |
| `DELETE` | `/api-keys/:id` | Revoke key |

### Billing — `/billing/*`

| Method | Path | Description |
|---|---|---|
| `GET` | `/billing/plan` | Current plan + usage summary |
| `POST` | `/billing/checkout` | Create Stripe Checkout session |
| `POST` | `/billing/portal` | Create Stripe billing portal session |
| `GET` | `/billing/credits` | Prepaid credit balance |
| `POST` | `/billing/credits/topup` | Initiate credit top-up |

### Usage — `/usage/*`

| Method | Path | Description |
|---|---|---|
| `GET` | `/usage/summary` | Current period quota usage |
| `GET` | `/usage/history` | Paginated usage event log |

### Webhooks — `/webhooks/*`

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhooks/stripe` | Stripe event receiver (validates signature) |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Gateway health (not proxied) |
| `GET` | `/health` | API health (proxied via gateway) |

---

## Communication Patterns

### Synchronous HTTP

Used for all client-facing request/response interactions. The gateway proxies HTTP requests to `services/api` using `reqwest` with streaming support, preserving response body streaming for SSE compatibility.

### Agent Run Dispatch (async)

`POST /agents/:id/run` is intentionally non-blocking:

```
Client → POST /agents/:id/run → services/api
  services/api validates auth + quota snapshot
  services/api publishes AgentExecuteJob → NATS MASCHINA_JOBS
  services/api returns 202 Accepted { runId }
  services/daemon picks up job, executes, publishes result
  services/realtime fans out AgentRunCompleted to client WebSocket/SSE
```

### WebSocket (real-time events)

Clients connect to `wss://api.maschina.io/ws?token=<jwt>`. The gateway upgrades the connection and bridges it to `services/realtime`. The realtime service fans out events from NATS core subjects to the client's live connection.

### SSE (server-sent events)

Clients that cannot use WebSocket connect to `/events/*`. Proxied via gateway as a streaming HTTP response. Same NATS fan-out logic in `services/realtime`.

---

## Request / Response Conventions

### Success responses

```json
{ "data": { ... } }
{ "data": [ ... ], "pagination": { "page": 1, "limit": 20, "total": 100 } }
```

### Error responses

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect",
    "status": 401
  }
}
```

### Error codes

| Code | HTTP | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT / API key |
| `FORBIDDEN` | 403 | Authenticated but not permitted |
| `NOT_FOUND` | 404 | Resource does not exist |
| `VALIDATION_ERROR` | 422 | Request body failed schema validation |
| `QUOTA_EXCEEDED` | 429 | Plan quota exhausted |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Pagination

All list endpoints accept `?page=1&limit=20`. Responses include a `pagination` envelope with `page`, `limit`, and `total`.

### Correlation IDs

Every request receives an `x-request-id` header injected by the gateway. This ID is propagated to upstream services and included in logs and traces, enabling cross-service request tracing.

---

## Versioning Strategy

- Current API is version 1; the `/v1/` prefix is implicit in routing
- Breaking changes (field removals, semantic changes) bump the version to `/v2/`
- Additive changes (new fields, new endpoints) are non-breaking and deployed without a version bump
- Deprecated fields are marked in the schema and removed after one major version cycle

---

## Internal Service APIs

| Service | Protocol | Used By |
|---|---|---|
| `services/runtime` `POST /run` | HTTP | `services/daemon` only — not gateway-exposed |
| `services/realtime` WebSocket hub | HTTP upgrade | Gateway bridges client WS to realtime |
| NATS subjects | NATS protocol | All services — job dispatch + event fan-out |
