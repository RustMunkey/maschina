# System Architecture


Maschina is a polyglot autonomous agent platform built on a microservices architecture. The platform combines Rust for performance-critical control-plane services, TypeScript for API and web layers, and Python for AI/ML workloads. All components are organized in a unified monorepo and communicate over NATS JetStream.

---

## Technology Stack Overview

| Layer | Technology | Purpose |
|---|---|---|
| **Languages** | TypeScript, Rust, Python | API/web, control plane, AI/ML |
| **Web** | Vite + React 19 + TanStack Router | All web applications |
| **UI** | Tailwind CSS + shadcn/ui | Styling and components |
| **API** | Hono (TS) + Axum (Rust) | Business logic + edge gateway |
| **Database** | PostgreSQL (Neon) + SQLite | Primary store + local dev |
| **ORM** | Drizzle | Type-safe dual-dialect queries |
| **Cache** | Redis + ioredis | Quota counters, rate limiting |
| **Messaging** | NATS JetStream | Job dispatch, event streaming |
| **Auth** | Custom JWT + argon2id | Sessions, API keys, OAuth |
| **Billing** | Stripe Checkout | Subscriptions + prepaid credits |
| **Search** | Meilisearch | Full-text search |
| **Vectors** | Qdrant + pgvector | Semantic search, RAG |
| **Workflows** | Temporal | Durable multi-step orchestration |
| **Email** | Resend + React Email | Transactional email |
| **Observability** | OpenTelemetry + Grafana stack | Traces, metrics, logs |
| **Hosting** | Fly.io → AWS ECS | Phase 1 → Phase 3 |
| **Blockchain** | Helius + Solana | On-chain reputation, staking |

---

## Major Components

```
┌─────────────────────────────────────────────────────────────┐
│                         Clients                             │
│    apps/web   apps/app   apps/console   apps/desktop        │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS / WSS
┌───────────────────────────▼─────────────────────────────────┐
│                  services/gateway  (Axum)                   │
│       JWT validation · Rate limiting · Reverse proxy        │
└──────┬──────────────────────────────────────┬───────────────┘
       │ HTTP                                 │ WebSocket / SSE
┌──────▼──────────┐                ┌──────────▼──────────────┐
│  services/api   │                │   services/realtime      │
│  (Hono · TS)    │                │   (Axum · Rust)          │
│  Auth · Billing │                │   WS hub · SSE · fan-out │
│  Agents · Keys  │                └────────────┬─────────────┘
└──────┬──────────┘                             │
       │ NATS publish                           │ NATS subscribe
       └─────────────────┬──────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                     NATS JetStream                          │
│   MASCHINA_JOBS · MASCHINA_AGENTS · MASCHINA_NOTIFICATIONS  │
└────────────────────────┬────────────────────────────────────┘
                         │ Pull consumer
┌────────────────────────▼────────────────────────────────────┐
│                  services/daemon  (Rust)                    │
│          SCAN → EVALUATE → EXECUTE → ANALYZE                │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP POST /run
┌────────────────────────▼────────────────────────────────────┐
│                  services/runtime  (Python)                 │
│        FastAPI · AgentRunner · Risk checks · Anthropic      │
└─────────────────────────────────────────────────────────────┘
```

---

## System Topology

### Data stores

| Store | Technology | Consumers |
|---|---|---|
| Primary DB | PostgreSQL (Neon) | api, daemon |
| Local DB | SQLite | Dev only (auto-detected from `file:` URL) |
| Cache | Redis | api (quotas, rate limits, sessions) |
| Search | Meilisearch | api |
| Vectors | Qdrant | api, runtime |
| Object storage | AWS S3 | All services via presigned URLs |

### Communication patterns

| Pattern | Technology | Purpose |
|---|---|---|
| Request/response | HTTP | Standard REST via gateway → api |
| Job dispatch | NATS JetStream publish | api queues agent runs |
| Job consumption | NATS JetStream pull consumer | Daemon dequeues jobs |
| Event fan-out | NATS core subscribe | Realtime pushes to connected clients |
| Durable workflows | Temporal | Multi-step agent pipelines |
| WebSocket | Axum WS bridge | Client ↔ gateway ↔ realtime |
| SSE | Axum SSE | Unidirectional event streams |

### Agent run lifecycle

```
1.  Client   → POST /agents/:id/run            → gateway
2.  Gateway  → JWT validation + rate limit      → api
3.  api      → INSERT agent_runs (queued)       → PostgreSQL
4.  api      → publish to MASCHINA_JOBS         → NATS
5.  api      → publish AgentRunQueued event     → NATS (realtime fan-out)
6.  api      → 202 { runId, status: "queued" }  → client
7.  daemon   → pull job from NATS               → NATS
8.  daemon   → evaluate quota + plan gates      → Redis + PostgreSQL
9.  daemon   → POST /run                        → runtime
10. runtime  → risk check input                 → maschina-risk
11. runtime  → AgentRunner multi-turn loop      → Anthropic API
12. runtime  → risk scan output                 → maschina-risk
13. runtime  → RunResult                        → daemon
14. daemon   → UPDATE agent_runs + usage        → PostgreSQL
15. daemon   → publish AgentRunCompleted        → NATS → realtime → client WS/SSE
```
