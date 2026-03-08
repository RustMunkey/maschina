# Observability

---

## Stack

| Tool | Purpose |
|---|---|
| **OpenTelemetry** | Distributed tracing — traces flow across all 5 services |
| **Grafana Tempo** | Trace storage and query (OTLP endpoint) |
| **Prometheus** | Metrics collection — scraped from all services |
| **Grafana** | Dashboards for metrics (Prometheus) + traces (Tempo) + logs (Loki) |
| **Grafana Loki** | Log aggregation across all services |
| **Sentry** | Error tracking — React apps, TypeScript API, Rust services |
| **LangSmith** | LLM-specific tracing — prompt/response, token counts, latency per turn |

> A single agent run crosses 4 services: gateway → api → daemon → runtime. Without distributed traces, cross-service debugging is guesswork.

---

## Distributed Tracing — OpenTelemetry

### Instrumentation

| Service | SDK |
|---|---|
| `services/api` | `@opentelemetry/sdk-node` (via `packages/telemetry`) |
| `services/gateway` | `tracing` + `opentelemetry` crates |
| `services/daemon` | `tracing` + `opentelemetry` crates |
| `services/realtime` | `tracing` + `opentelemetry` crates |
| `services/runtime` | `opentelemetry-sdk` (Python) |

All services export traces to Grafana Tempo via OTLP/HTTP (`OTEL_EXPORTER_OTLP_ENDPOINT`).

### Trace propagation

The `x-request-id` injected by the gateway is used as the root span ID. Each upstream service propagates the W3C Trace Context headers (`traceparent`, `tracestate`).

### Key spans

| Span | Service | Attributes |
|---|---|---|
| `http.request` | gateway | method, path, status, user_id |
| `agent.run.dispatch` | api | agent_id, user_id, plan_tier |
| `daemon.evaluate` | daemon | agent_id, quota_remaining |
| `daemon.execute` | daemon | agent_id, runtime_url, timeout |
| `runtime.run` | runtime | model, input_tokens, output_tokens, turns |
| `llm.call` | runtime | model, stop_reason, latency_ms |

---

## Metrics — Prometheus

### Scrape targets

| Service | Metrics endpoint |
|---|---|
| `services/daemon` | `:9090/metrics` |
| `services/gateway` | `:8080/metrics` |
| `services/realtime` | `:4000/metrics` |
| `services/runtime` | `:8001/metrics` |

### Key metrics

| Metric | Type | Description |
|---|---|---|
| `agent_runs_total` | Counter | Total agent runs by status |
| `agent_run_duration_seconds` | Histogram | End-to-end run latency |
| `llm_tokens_used_total` | Counter | Token consumption by model |
| `nats_messages_consumed_total` | Counter | Jobs pulled from NATS |
| `http_requests_total` | Counter | Request count by path + status |
| `http_request_duration_seconds` | Histogram | Request latency |
| `active_ws_connections` | Gauge | Live WebSocket connections |
| `quota_exceeded_total` | Counter | Quota rejections by plan tier |

---

## Logging — Grafana Loki

All services emit structured JSON logs. Loki aggregates via Promtail or Docker log driver.

### Log format

```json
{
  "level": "info",
  "timestamp": "2026-03-07T12:00:00.000Z",
  "service": "maschina-api",
  "request_id": "uuid",
  "user_id": "uuid",
  "message": "Agent run dispatched",
  "agent_id": "uuid",
  "run_id": "uuid"
}
```

### Log levels

| Level | When |
|---|---|
| `error` | Unexpected failures, panics, unhandled exceptions |
| `warn` | Recoverable issues, retries, quota near-limit |
| `info` | Lifecycle events — request received, job dispatched, run completed |
| `debug` | Verbose — request headers, NATS payloads (not in production) |

Never log: secrets, tokens, password hashes, raw API keys, PII.

---

## Error Tracking — Sentry

Sentry is initialized in all services with the `SENTRY_DSN` environment variable. Captures:

- Unhandled exceptions and panics
- API 5xx responses
- Slow query alerts (>500ms)
- Release tracking (deploys tagged with git SHA)

```typescript
// services/api
import * as Sentry from "@sentry/node";
Sentry.init({ dsn: process.env.SENTRY_DSN, release: process.env.GIT_SHA });
```

```rust
// Rust services — sentry crate
let _guard = sentry::init((dsn, sentry::ClientOptions { release: sentry::release_name!(), ..Default::default() }));
```

---

## LLM Observability — LangSmith

Every agent run in `services/runtime` is traced via LangSmith when `LANGSMITH_API_KEY` is set:

- Full prompt + completion capture
- Token counts (input/output per turn)
- Tool call inputs/outputs
- Run ID linked to the agent run record
- Latency per LLM call

LangSmith traces are linked to Tempo traces via run ID in metadata.

---

## Grafana Dashboards

Local Grafana runs at `http://localhost:3001` (default credentials: admin/admin).

Pre-built dashboards:
- **Agent Runs** — run volume, latency, error rate, token consumption
- **Service Health** — HTTP request rate, error rate, p50/p95/p99 latency per service
- **NATS Queue** — job queue depth, consumer lag, ack/nak rates
- **Infrastructure** — CPU, memory, network per service

---

## Alerting

Prometheus alerting rules fire on:
- Agent run error rate > 5% over 5 minutes
- NATS consumer lag > 100 messages for > 2 minutes
- Any service returning >1% HTTP 5xx for >1 minute
- p99 latency > 5s on `/agents/:id/run`
- Redis memory usage > 80%

Alerts route to the on-call channel.
