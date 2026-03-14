# AI Architecture

---

## Overview

AI workloads in Maschina are isolated to Python services and packages, keeping the non-deterministic, GPU-adjacent code away from the statically-typed control plane. The execution path runs from `services/daemon` through `services/runtime`, which wraps the `maschina-runtime` agent loop.

---

## Model Pipeline

```
services/daemon
  │  POST /run → services/runtime
  ▼
services/runtime (FastAPI)
  │  check_input()           ← maschina-risk: prompt injection, length
  │  AgentRunner.run()       ← maschina-runtime: multi-turn LLM loop
  │  check_output()          ← maschina-risk: PII scan
  └─ RunResponse             → daemon
```

---

## Packages

### maschina-runtime (`packages/runtime`)

The core LLM execution loop. Framework-agnostic — works with any model that supports Anthropic's tool_use protocol.

**`AgentRunner`**

```python
class AgentRunner:
    def __init__(self, client, system_prompt, model, tools, timeout_secs, max_turns=20)
    async def run(self, inp: RunInput) -> RunResult
    async def _run_loop(self, inp: RunInput) -> RunResult
```

Loop logic:
1. Send system prompt + user message to Anthropic API
2. If `stop_reason == "end_turn"` — collect text blocks, return `RunResult`
3. If `stop_reason == "tool_use"` — execute each tool block, append `tool_result` user turn, continue
4. If `stop_reason == "max_tokens"` or loop exceeds `MAX_TURNS` (20) — raise timeout error

**`Tool` base class**

```python
class Tool(ABC):
    name: str
    description: str
    input_schema: dict

    @abstractmethod
    async def run(self, input: dict) -> str

    def to_anthropic_format(self) -> dict
```

Built-in tools: `HttpFetchTool` (safe HTTP GET for agent web access).

**Models**

```python
class RunInput(BaseModel):
    run_id: str
    message: str
    context: dict | None

class RunResult(BaseModel):
    run_id: str
    output: str
    input_tokens: int
    output_tokens: int
    duration_ms: int
    turns: int
```

### maschina-agents (`packages/agents`)

Agent type base classes. Each type carries a default system prompt fragment, allowed tool set, and capability flags.

| Agent Type | Role |
|---|---|
| `SignalAgent` | Market signal detection, data ingestion |
| `AnalysisAgent` | Structured data analysis, report generation |
| `ExecutionAgent` | Action execution — API calls, transactions |
| `OptimizationAgent` | Iterative improvement loops |
| `ReportingAgent` | Scheduled summaries, formatted outputs |

All types extend `MaschinaAgent`:

```python
class MaschinaAgent(ABC):
    agent_type: AgentType
    default_tools: list[Tool]
    system_prompt_prefix: str
```

### maschina-risk (`packages/risk`)

Pre- and post-run safety checks. Runs synchronously in `services/runtime` — blocking on input, advisory on output.

```python
def check_input(text: str, tier: str = "access") -> RiskResult
def check_output(text: str) -> RiskResult
def check_quota_pre_run(*, monthly_token_limit, tokens_used_this_month, estimated_tokens) -> RiskResult
```

**Input checks:**
- Prompt injection pattern matching (blocklist of known injection phrases)
- Oversized input rejection (max 32,768 chars for `access` tier)

**Output checks:**
- PII scan: SSN pattern (`\d{3}-\d{2}-\d{4}`), credit card (Luhn-adjacent), password fields, API key patterns
- Flags are logged but do not block output (advisory only)

**Quota check:**
- Compares `tokens_used_this_month + estimated_tokens` against `monthly_token_limit`
- Returns `approved=False` with reason if quota would be exceeded

---

## Inference Services

### Primary Provider — Anthropic

All cloud agent runs use the Claude API via the Anthropic Python SDK. Model access is gated by plan tier and defined in `packages/model/src/catalog.ts`.

| Model | Plan required | Billing multiplier | Default for |
|---|---|---|---|
| `claude-haiku-4-5` | M1+ | 1x | M1 |
| `claude-sonnet-4-6` | M5+ | 3x | M5, Mach Team |
| `claude-opus-4-6` | M10+ | 15x | M10, Enterprise, Internal |

Multipliers are applied to raw token counts in `services/runtime` before returning billed counts to the daemon. Token budgets are in haiku-equivalent tokens — intuitive for users, accurate for billing.

Model is configurable per agent at creation time. Attempting to use a model above your plan tier returns a `403` with an upgrade message.

### Local Inference — Ollama

`Access` (free) tier users are limited to local Ollama inference only. The runtime detects `model` starting with `ollama/` and routes to a local Ollama endpoint instead of the Anthropic API.

---

## Embeddings

Embeddings are generated via the Anthropic Embeddings API or a self-hosted model, producing 1536-dimensional vectors.

| Use case | Storage | Generation point |
|---|---|---|
| Agent memory (lightweight) | pgvector | On run completion |
| Document RAG | Qdrant `document_chunks` | On document ingest |
| Marketplace semantic search | Qdrant `marketplace_listings` | On listing publish |

---

## ML Observability

### LangSmith

LLM tracing — every agent run is instrumented with:
- Full prompt + completion capture
- Token counts (input/output)
- Latency per turn
- Tool call inputs/outputs
- Run metadata (agent ID, user ID, plan tier)

Traces are linked to the run ID for cross-service correlation.

### Weights & Biases

Experiment tracking for model evaluations and fine-tuning runs:
- Eval harness results (accuracy, latency, cost per task)
- Training run metrics
- Dataset versioning

### OpenTelemetry

`services/runtime` emits OTLP spans for:
- `/run` endpoint duration
- `check_input` / `check_output` latency
- LLM API call duration and token counts
- Tool execution per call

Traces correlate with the `x-request-id` propagated from the gateway.

---

## Safety Layers

| Layer | Where | What |
|---|---|---|
| Input risk check | `services/runtime` | Prompt injection, oversized input |
| Output risk check | `services/runtime` | PII pattern scan |
| Quota pre-check | `services/daemon` (evaluate phase) | Redis + DB quota vs limit |
| Plan gate | `services/daemon` (evaluate phase) | Model access, run concurrency |
| Per-run timeout | `services/daemon` (execute phase) | `AGENT_TIMEOUT_SECS` enforced |
| Rate limiting | `services/gateway` | Per-IP and per-user request limits |
