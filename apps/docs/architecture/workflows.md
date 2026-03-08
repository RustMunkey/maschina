# Workflow Architecture

---

## Overview

Maschina uses two complementary systems for async work — NATS JetStream for fast fire-and-forget job dispatch, and Temporal for durable multi-step workflows. They are not alternatives; they solve different problems and coexist.

| System | When to use |
|---|---|
| **NATS JetStream** | Single-step jobs: run an agent, send an email, update a billing record |
| **Temporal** | Multi-step pipelines: run agent A → wait for approval → run agent B → send report |

---

## NATS JetStream — Job Queue

### Streams

| Stream | Retention | Subjects | Consumers |
|---|---|---|---|
| `MASCHINA_JOBS` | WorkQueue | `maschina.jobs.>` | Pull consumers per service |
| `MASCHINA_AGENTS` | Limits (7d) | `maschina.agents.>` | Push consumers (realtime fan-out) |
| `MASCHINA_USERS` | Limits (7d) | `maschina.users.>` | Push consumers |
| `MASCHINA_BILLING` | Limits (7d) | `maschina.billing.>` | Push consumers |
| `MASCHINA_NOTIFICATIONS` | Limits (7d) | `maschina.notifications.>` | Push consumers (realtime fan-out) |
| `MASCHINA_USAGE` | Limits (7d) | `maschina.usage.>` | Push consumers |

### Job Types (`MASCHINA_JOBS`)

| Subject | Payload | Consumer |
|---|---|---|
| `maschina.jobs.agent.execute` | `AgentExecuteJob` | `services/daemon` |
| `maschina.jobs.email.verify` | `EmailVerifyJob` | `services/api` email worker |
| `maschina.jobs.email.reset` | `EmailResetJob` | `services/api` email worker |
| `maschina.jobs.email.receipt` | `EmailReceiptJob` | `services/api` email worker |
| `maschina.jobs.email.notify` | `EmailNotifyJob` | `services/api` email worker |
| `maschina.jobs.billing.sync` | `BillingSyncJob` | `services/api` billing worker |
| `maschina.jobs.maintenance.gc` | `GarbageCollectJob` | Internal maintenance consumer |

### Dispatch Pattern

```typescript
// services/api — dispatch agent run
import { publishJob } from "@maschina/jobs";

await publishJob("maschina.jobs.agent.execute", {
  runId: run.id,
  agentId: agent.id,
  userId: user.id,
  planTier: user.plan,
  systemPrompt: agent.systemPrompt,
  model: agent.model,
  input: req.body.input,
});
```

### Daemon Execution Pipeline

```
SCAN
  Pull batch from NATS JetStream pull consumer
  Consumer: daemon-agent-worker (durable)
  Max in-flight: controlled by semaphore (concurrency limit)
       ↓
EVALUATE
  Check plan tier → model gate
  Check Redis quota → monthly token limit
  If quota exhausted → nak(delay) and skip
       ↓
EXECUTE
  POST /run to services/runtime
  Enforce AGENT_TIMEOUT_SECS
       ↓
ANALYZE
  Parse RunResponse
  UPDATE agent_runs (status, output, tokens, timing)
  INSERT usage_events
  Publish AgentRunCompleted → NATS MASCHINA_AGENTS
  ACK NATS message
```

### Acknowledgment Protocol

- **ACK** — job completed successfully
- **NAK(delay)** — job failed transiently, retry after delay (quota exhausted, runtime timeout)
- **TERM** — job is unprocessable, discard permanently (malformed payload, agent not found)

---

## Temporal — Durable Workflows

### When Temporal is used

NATS handles jobs that complete in a single pass. Temporal is for workflows that:
- Span multiple services or steps
- Require human-in-the-loop approval gates
- Must persist state across failures (retries across days)
- Need complex branching, compensation, or saga patterns

**Example workflows:**
- Multi-agent pipeline: Signal agent → Analysis agent → Execution agent → Report
- Onboarding sequence: Account created → verify email (wait) → provision resources → send welcome
- Scheduled agent chains: daily digest → summarize → distribute

### Workflow definitions

Temporal workflows are defined in `packages/workflows` (TypeScript) and triggered from `services/api` via the Temporal client.

```typescript
// packages/workflows/src/agent-pipeline.ts
export async function agentPipelineWorkflow(params: AgentPipelineParams): Promise<void> {
  const signalResult = await executeActivity(runAgent, { agentId: params.signalAgentId, ... });
  await sleep("1 hour");  // durable wait — survives process restart
  const analysisResult = await executeActivity(runAgent, { agentId: params.analysisAgentId, input: signalResult.output });
  await executeActivity(sendReport, { result: analysisResult, userId: params.userId });
}
```

### Infrastructure

Temporal runs locally via Docker Compose (`temporalio/auto-setup:1.24`, port 7233).
Temporal UI runs at port 8088 for local workflow inspection.

In production, Temporal Cloud or a self-managed Temporal cluster on Fly.io.

### Activity retry policy

```typescript
{ maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2, maximumInterval: "30s" }
```

---

## Event Bus — NATS Core

Beyond job queues, NATS core (non-JetStream) subjects carry ephemeral fan-out events consumed by `services/realtime`.

### Realtime subjects

| Subject pattern | Publisher | Subscriber |
|---|---|---|
| `maschina.agents.run.>` | `services/daemon` | `services/realtime` |
| `maschina.notifications.>` | `services/api` | `services/realtime` |
| `maschina.billing.>` | `services/api` | `services/realtime` |
| `maschina.usage.>` | `services/daemon` | `services/realtime` |

`services/realtime` subscribes to all subjects above and fans out matching events to the user's live WebSocket/SSE connection based on `userId` extracted from the event envelope.

---

## Client Package

`packages/nats` — typed NATS/JetStream client with:
- Connection lifecycle management (reconnect, drain)
- Stream + consumer bootstrap (`ensureStreams()`)
- Typed `publish<T>()` with codec
- Pull consumer helpers
- Push consumer helpers

`packages/jobs` — typed job dispatch on top of `packages/nats`:
- Job type definitions with Zod schemas
- `publishJob(subject, payload)` helper
- `consumeJobs(subject, handler)` pull consumer wrapper
