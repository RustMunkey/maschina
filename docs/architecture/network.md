# Network Architecture

---

## Service Communication

### Internal topology

```
Internet
    │
    ▼
Cloudflare (DNS + DDoS)
    │
    ▼
services/gateway  :8080   ← Only public-facing service
    │
    ├── HTTP/1.1 proxy ──────────────→ services/api      :3000
    ├── WebSocket bridge ────────────→ services/realtime  :4000
    └── SSE stream proxy ────────────→ services/realtime  :4000

services/daemon   :9090 (health only, no public route)
    └── HTTP client ─────────────────→ services/runtime   :8001

All services ←──── NATS ─────────────→ All services      :4222
```

All inter-service HTTP communication is over the Fly.io private 6PN network (IPv6, encrypted). No service other than the gateway exposes a public address.

---

## services/gateway — Edge Layer

The gateway is the single ingress point. It handles:

- **TLS termination** — managed by Cloudflare (edge) and Fly.io (origin)
- **CORS enforcement** — allowed origins configured via `CORS_ORIGIN` env var
- **JWT validation** — stateless (only `JWT_SECRET` needed, no DB call)
- **API key forwarding** — passes raw key as `x-forwarded-api-key` header; `services/api` validates against DB
- **Rate limiting** — per-IP (120 req/min) for unauthenticated; per-user (1,000 req/min) for JWT requests
- **Correlation ID** — injects `x-request-id` UUID on every request
- **Reverse proxy** — all `/*` HTTP to `services/api`; `/ws/*` and `/events/*` to `services/realtime`

### Headers injected by gateway

| Header | Value | Injected when |
|---|---|---|
| `x-request-id` | UUID v4 | Always |
| `x-forwarded-user-id` | JWT `sub` claim | JWT auth |
| `x-forwarded-plan-tier` | JWT `plan` claim | JWT auth |
| `x-forwarded-api-key` | Raw API key value | API key auth |

Upstream services trust these headers unconditionally — they are only reachable via the gateway on internal network.

---

## Routing Table

| Path | Protocol | Upstream | Notes |
|---|---|---|---|
| `GET /health` | HTTP | Gateway local | Not proxied |
| `/ws/*` | WebSocket | `services/realtime` | Upgrade + bidirectional bridge |
| `/events/*` | SSE | `services/realtime` | Streaming HTTP proxy |
| `/*` | HTTP | `services/api` | All other routes |

---

## External Integrations

| Service | Direction | Protocol | Purpose |
|---|---|---|---|
| Anthropic API | Outbound | HTTPS | LLM inference (from `services/runtime`) |
| Stripe | Outbound | HTTPS | Checkout, billing portal, subscriptions |
| Stripe webhooks | Inbound | HTTPS | Payment events → `POST /webhooks/stripe` |
| Resend | Outbound | HTTPS | Transactional email dispatch |
| Meilisearch | Internal | HTTP | Search index read/write (from `services/api`) |
| Qdrant | Internal | HTTP/gRPC | Vector search (from `services/runtime`) |
| Neon | Outbound | PostgreSQL wire | Database (production) |
| Redis | Internal | Redis protocol | Quota counters, sessions |
| NATS | Internal | NATS protocol | Job dispatch, event fan-out |
| Temporal | Internal | gRPC | Workflow orchestration |
| Helius | Outbound | HTTPS | Solana RPC + on-chain event webhooks |
| Helius webhooks | Inbound | HTTPS | On-chain events → processing handler |
| LangSmith | Outbound | HTTPS | LLM trace export (from `services/runtime`) |
| Svix | Outbound | HTTPS | Outbound developer webhook delivery |
| Sentry | Outbound | HTTPS | Error reporting (all services) |
| Grafana Tempo | Internal | OTLP/HTTP | Distributed trace ingestion |
| Prometheus | Internal | HTTP scrape | Metrics collection from all services |
| S3 | Outbound | HTTPS | Artifact storage |
| CloudFront | Outbound | HTTPS | CDN for static assets |

---

## DNS and Edge

**Cloudflare** manages DNS for all public domains. All traffic enters via Cloudflare proxy:

- DDoS protection at the edge
- WAF for basic request filtering
- Edge TLS termination (Cloudflare → Fly.io is TLS-encrypted)
- `api.maschina.ai` → Fly.io gateway
- `maschina.ai`, `app.maschina.ai` → Fly.io or CDN for web apps

---

## Deployment Network (Fly.io)

In Phase 1 and 2, all services run on Fly.io. Internal traffic uses the **Fly 6PN** private network:

- All Fly apps in the same org share a private IPv6 network
- Addresses: `<app-name>.internal` resolves over 6PN
- No public exposure needed for daemon, runtime, realtime, or api — only gateway is public

```
services/daemon → services/runtime.internal:8001
services/gateway → services/api.internal:3000
services/gateway → services/realtime.internal:4000
```

NATS, Redis, and Temporal are reachable on 6PN as managed or internal services.

---

## Production Network (Phase 3 — AWS)

When transitioning to AWS ECS/EKS:

- Services run in a **VPC** with private subnets
- Gateway exposed via **Application Load Balancer** (public-facing)
- Internal services communicate via **VPC DNS** (not exposed)
- NATS cluster deployed in private subnet
- RDS/ElastiCache in private subnet, no internet route
- S3 accessed via **VPC Gateway Endpoint** (no internet)
- CloudFront in front of S3 and static assets

---

## Ports Reference

| Service | Port | Exposure |
|---|---|---|
| `services/gateway` | 8080 | Public (via Cloudflare) |
| `services/api` | 3000 | Internal only |
| `services/daemon` | 9090 | Internal only (health + metrics) |
| `services/realtime` | 4000 | Internal only (gateway bridges) |
| `services/runtime` | 8001 | Internal only (daemon only) |
| NATS | 4222 | Internal only |
| Redis | 6379 | Internal only |
| PostgreSQL | 5432 | Internal only |
| Meilisearch | 7700 | Internal only |
| Qdrant REST | 6333 | Internal only |
| Qdrant gRPC | 6334 | Internal only |
| Temporal | 7233 | Internal only |
| Temporal UI | 8088 | Internal only (dev) |
| Grafana | 3001 | Internal only |
| Prometheus | 9091 | Internal only |
