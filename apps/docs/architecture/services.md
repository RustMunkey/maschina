# Service Architecture

---

## Service Map

| Service | Language | Framework | Port | Role |
|---|---|---|---|---|
| `services/gateway` | Rust | Axum | 8080 | Public edge — auth, rate limiting, proxy |
| `services/api` | TypeScript | Hono | 3000 | Business logic API |
| `services/daemon` | Rust | Tokio | 9090 (health) | Agent job orchestrator |
| `services/realtime` | Rust | Axum | 4000 | WebSocket / SSE hub |
| `services/runtime` | Python | FastAPI | 8001 | Agent execution sandbox |
| `services/worker` | Python | — | — | NATS job consumer (email, webhooks, analytics) |

---

## services/gateway

**Language:** Rust · **Framework:** Axum · **Port:** 8080

The public-facing edge service. Every request from clients or the internet passes through the gateway before reaching any internal service. It is the only service with a public IP.

### Responsibilities

- JWT validation (stateless — only needs `JWT_SECRET`)
- API key forwarding (passes `x-forwarded-api-key` to api for DB validation)
- Per-IP rate limiting for unauthenticated requests (120 req/min)
- Per-user rate limiting for JWT requests (1,000 req/min via governor)
- Reverse proxy to `services/api` for all HTTP requests
- WebSocket upgrade proxy to `services/realtime` for `/ws/*` paths
- SSE streaming proxy to `services/realtime` for `/events/*` paths
- Request correlation ID injection (`x-request-id`)
- CORS enforcement

### Routing

| Path | Upstream |
|---|---|
| `GET /health` | Local handler (not proxied) |
| `/ws/*` | `services/realtime` (WebSocket bridge) |
| `/events/*` | `services/realtime` (SSE stream) |
| `/*` (all else) | `services/api` |

### Key modules

| Module | Purpose |
|---|---|
| `auth.rs` | JWT decode, API key detection, `AuthContext` enum |
| `middleware.rs` | Rate limiting + header injection middleware |
| `proxy.rs` | HTTP reverse proxy + WebSocket bridge |
| `config.rs` | Environment-based config |
| `state.rs` | `AppState` (HTTP client, rate limiters) |

---

## services/api

**Language:** TypeScript · **Framework:** Hono · **Port:** 3000

The primary business logic service. Handles authentication, user management, agent lifecycle, billing, usage tracking, and webhook delivery.

### Responsibilities

- User registration, login, session management, email verification, password reset
- Agent CRUD and run dispatch (publishes to NATS on run)
- API key issuance and validation
- Stripe Checkout session creation, webhook processing
- Usage quota enforcement via Redis
- In-app notification creation
- Email job dispatch via NATS
- Meilisearch index updates on entity changes
- Temporal workflow triggers for complex pipelines

### Routes

| Prefix | Module | Description |
|---|---|---|
| `/auth/*` | `routes/auth.ts` | Register, login, logout, verify, reset |
| `/users/*` | `routes/users.ts` | Profile, settings |
| `/agents/*` | `routes/agents.ts` | Create, list, run, delete |
| `/api-keys/*` | `routes/keys.ts` | Issue, list, revoke |
| `/billing/*` | `routes/billing.ts` | Checkout, portal, credits |
| `/usage/*` | `routes/usage.ts` | Quota summary, history |
| `/webhooks/*` | `routes/webhooks.ts` | Stripe webhook handler |
| `GET /health` | `routes/health.ts` | Health check |

### Startup sequence

1. `initTelemetry()` — OpenTelemetry SDK
2. `connectNats()` → `ensureStreams()` — NATS + JetStream streams
3. `startEmailWorker()` — NATS pull consumer for email jobs
4. `serve()` — Hono HTTP server

---

## services/daemon

**Language:** Rust · **Framework:** Tokio · **Health port:** 9090

The agent job orchestrator. Continuously pulls jobs from NATS JetStream and executes them through a four-phase pipeline.

### Responsibilities

- Pull `AgentExecuteJob` messages from `MASCHINA_JOBS` NATS stream
- Evaluate whether a run is permissible (quota, plan gates)
- Dispatch execution to `services/runtime` via HTTP
- Analyze results, update PostgreSQL, record usage
- Publish `AgentRunCompleted` / `AgentRunFailed` events to NATS

### Execution pipeline

```
SCAN     Pull batch from NATS JetStream pull consumer
         ↓
EVALUATE Check plan tier, quota limits (Redis + DB)
         Block if quota exhausted; nak the NATS message
         ↓
EXECUTE  POST /run to services/runtime
         Enforce per-run timeout (AGENT_TIMEOUT_SECS)
         ↓
ANALYZE  Parse result, UPDATE agent_runs + usage_events
         Publish completion event to NATS
         ACK the NATS message
```

### Key modules

| Module | Purpose |
|---|---|
| `orchestrator/scan.rs` | NATS pull consumer loop |
| `orchestrator/scan_compat.rs` | Type bridge: NATS payload → `JobToRun` |
| `orchestrator/evaluate.rs` | Quota + plan gate checks |
| `orchestrator/execute.rs` | HTTP dispatch to runtime |
| `orchestrator/analyze.rs` | Result processing + NATS publish |
| `runtime/mod.rs` | HTTP client for runtime service |
| `server/mod.rs` | Health + Prometheus metrics endpoints |

---

## services/realtime

**Language:** Rust · **Framework:** Axum · **Port:** 4000

The WebSocket and SSE hub. Maintains long-lived connections to clients and fans out platform events in real time.

### Responsibilities

- Accept WebSocket connections from clients (proxied through gateway)
- Accept SSE connections for clients that prefer unidirectional streams
- Validate identity via `x-forwarded-user-id` (from gateway) or `?token=` JWT (direct connections)
- Maintain per-user broadcast channel registry (`DashMap<userId, broadcast::Sender>`)
- Subscribe to NATS core subjects for agent, notification, and billing events
- Fan out matching events to all live connections for the target user

### Key modules

| Module | Purpose |
|---|---|
| `registry.rs` | Per-user broadcast channel (`DashMap`) |
| `auth.rs` | Identity resolution from headers or JWT |
| `handlers.rs` | WS upgrade handler, SSE handler, health |
| `nats.rs` | NATS subscriptions + fan-out dispatch |

---

## services/runtime

**Language:** Python · **Framework:** FastAPI · **Port:** 8001

The agent execution sandbox. Receives job descriptions from the daemon and runs them through the LLM pipeline with safety checks.

### Responsibilities

- Receive `RunRequest` from daemon (system prompt, model, input, timeout)
- Run pre-execution risk checks (`maschina-risk: check_input`)
- Execute agent via `maschina-runtime: AgentRunner` (multi-turn, tool calling)
- Run post-execution output scan (`maschina-risk: check_output`)
- Return `RunResponse` with output, token counts, and timing

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/run` | Execute an agent run |

### Model routing

The runtime routes by the `model` field in the request:

- `ollama/*` prefix → local OllamaRunner (Access tier, no quota deduction, multiplier 0x)
- All other values → Anthropic SDK

After the run, the runtime applies the billing multiplier to token counts before returning. The daemon records the already-multiplied counts in PostgreSQL. Multipliers: Haiku 1x, Sonnet 3x, Opus 15x, Ollama 0x.

### Shared packages

- `maschina-runtime` — `AgentRunner` (multi-turn LLM loop, tool calling)
- `maschina-agents` — Agent type base classes
- `maschina-risk` — Input/output safety checks

---

## services/worker

**Language:** Python · **Framework:** — · **Port:** none

Background job consumer. Subscribes to NATS JetStream subjects and processes async jobs that don't need to block the API request cycle.

### Responsibilities

- Email dispatch jobs (consume from `MASCHINA_JOBS`, call Resend via `packages/email`)
- Outbound webhook delivery jobs (sign payload, POST to user URL, retry with exponential backoff)
- Analytics flush jobs

### Job types consumed

| Job type | Source | Action |
|---|---|---|
| `email.*` | `services/api` on user events | Send transactional email via Resend |
| `webhook.dispatch` | `services/api` on agent run events | POST to user webhook URL with HMAC-SHA256 signature |
| `analytics.flush` | Periodic | Flush analytics events to PostHog |
