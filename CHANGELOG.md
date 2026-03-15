# Changelog

All notable changes to Maschina will be documented here.

Format: [Semantic Versioning](https://semver.org) — `[version] YYYY-MM-DD`

---

## [Unreleased]

### Added (2026-03-15 — Chain wiring / feat/chain-wiring)
- `services/daemon/src/chain.rs` — on-chain receipt anchoring: computes deterministic
  SHA-256 payload hash, builds Anchor `anchor_receipt` instruction (discriminator + borsh args),
  derives receipt + pool PDAs, loads authority keypair, submits via Helius RPC; fire-and-forget
- `services/daemon/src/orchestrator/analyze.rs` — calls `chain::submit_receipt()` after
  every successful run; converts task price cents → USDC lamports; no-op when CHAIN_ENABLED=false
- `services/daemon/src/config.rs` — added `helius_rpc_url`, `settlement_program_id`,
  `solana_authority_keypair`, `chain_enabled` fields
- `services/daemon/src/main.rs` — registered `mod chain`
- `services/daemon/Cargo.toml` — added `solana-sdk`, `solana-rpc-client`, `borsh`

### Added (2026-03-15 — Auto-suspend / feat/auto-suspend)
- `services/api/src/routes/nodes.ts` — slash handler now auto-suspends node
  (`status = 'suspended'`, `suspendedAt`) when post-slash `stakedUsdc` drops below
  the tier minimum; response includes `suspended: true` flag
- `services/daemon/src/orchestrator/analyze.rs` — `update_node_reputation()` now
  auto-suspends active nodes whose `reputation_score` drops below 20 with ≥10 tasks
  of signal; prevents degraded nodes from continuing to receive work

### Added (2026-03-15 — Solana settlement program / feat/solana-program)
- `programs/settlement/src/instructions/mod.rs` — exports all 5 instruction modules
- `programs/settlement/src/instructions/anchor_receipt.rs` — AnchorReceipt context + handler:
  Ed25519 signature verification (stub), receipt PDA init, earnings split (65/20/10/5)
  accumulated into SettlementPool, ReceiptAnchored event emitted
- `programs/settlement/src/instructions/deposit_stake.rs` — DepositStake: NodeStake + SettlementPool
  PDAs init_if_needed on first deposit; staked_amount accumulated; StakeDeposited event
- `programs/settlement/src/instructions/withdraw_stake.rs` — WithdrawStake (7-day lock) +
  FinaliseWithdrawal (post-lock SPL transfer stub); Clock::get() validation
- `programs/settlement/src/instructions/slash_stake.rs` — SlashStake: bps validation (1–10000),
  proportional slash from staked_amount, total_slashed tracking; StakeSlashed event
- `programs/settlement/src/instructions/settle_earnings.rs` — SettleEarnings: drains pool to
  node/developer/treasury/validators wallets (SPL CPI stub); EarningsSettled event
- `programs/settlement/src/lib.rs` — added finalise_withdrawal instruction
- `programs/Anchor.toml` — settlement program registered under [programs.localnet]
- `packages/chain/src/settlement.ts` — TypeScript Anchor client: PDA helpers (receiptPda, stakePda,
  poolPda), getSettlementProgram, fetchReceipt, isReceiptAnchored, UUID<->bytes utilities
- `packages/chain/src/webhook.ts` — Helius webhook processing: HeliusWebhookPayload types,
  processHeliusWebhook dispatcher, registerSettlementWebhook helper
- `packages/chain/src/index.ts` — exports for settlement + webhook modules
- `packages/chain/package.json` — added @coral-xyz/anchor ^0.30.1
- `services/api/src/routes/webhooks.ts` — POST /webhooks/helius: Helius auth header verification,
  processHeliusWebhook dispatch, onReceiptAnchored handler stub
- `services/api/src/env.ts` — HELIUS_WEBHOOK_SECRET optional env var

### Added (2026-03-15 — Run streaming / feat/run-streaming)
- `services/runtime/src/streaming.py` — SSE streaming endpoint for all three runners
  (Anthropic, OpenAI, Ollama); chunk/done/error event types; `POST /stream` added to FastAPI app
- `services/realtime/src/handlers.rs` — `POST /internal/run-event` handler: receives
  run status + chunk events from daemon and fans out to connected clients via broadcast registry
- `services/realtime/src/main.rs` — `/internal/run-event` route registered

### Added (2026-03-15 — Solana foundation / feat/solana-foundation)
- `packages/chain/` — Helius + Solana foundation: client singleton, wallet validation,
  Ed25519 ownership verification (buildChallenge + verifyWalletSignature via nacl)
- `services/api/src/routes/wallets.ts` — GET /wallets/challenge, POST /wallets,
  GET /wallets, POST /wallets/verify, DELETE /wallets/:id; Helius + Orb chosen as
  Solana RPC + usage metering layers
- CI + api package.json updated for @maschina/chain

### Added (2026-03-15 — Node binary / feat/node-binary)
- `services/node/` — new `maschina-node` Rust binary for compute node operators:
  - `src/identity.rs` — Ed25519 keypair generation + persistence to
    `~/.config/maschina-node/identity.toml`; `sign()` stub for Phase 5 receipt signing
  - `src/config.rs` — env-driven config: `MASCHINA_API_URL`, `MASCHINA_API_KEY`,
    `NODE_NAME`, `NODE_REGION`, `NODE_INTERNAL_URL`, `NODE_HEARTBEAT_INTERVAL_SECS`,
    `NODE_MAX_CONCURRENT_TASKS`, `NODE_CONFIG_DIR`
  - `src/api.rs` — typed API client: `register_node()`, `submit_public_key()`, `heartbeat()`
  - `src/heartbeat.rs` — periodic heartbeat loop with `ActiveTaskCounter` + `send_once()` for
    startup/shutdown
  - `src/main.rs` — full lifecycle: load/generate identity → register (idempotent) →
    submit public key → initial heartbeat → heartbeat loop → graceful shutdown
- `Cargo.toml` (workspace) — `services/node` added to workspace members
- `.github/workflows/ci.yml` — `maschina-node` added to all 4 Rust CI steps
  (fmt, clippy, test, build)

### Added (2026-03-15 — Task watchdog / feat/task-watchdog)
- `services/daemon/src/watchdog.rs` — standalone watchdog loop that sweeps `agent_runs`
  every 30s for runs stuck in `running` status beyond the timeout threshold; force-fails
  them with `error_code = "watchdog_timeout"`; reuses analyze phase for reputation update
  + realtime notification; race-safe (UPDATE WHERE status = 'running' + rows_affected check)
- `services/daemon/src/config.rs` — `watchdog_timeout_secs: Option<i64>` field;
  configurable via `WATCHDOG_TIMEOUT_SECS` env var; defaults to 600s
- `services/daemon/src/main.rs` — watchdog spawned alongside orchestrator + health server;
  `mod watchdog` registered

### Added (2026-03-15 — Node identity + staking / feat/node-identity)
- `packages/db/src/schema/pg/enums.ts` — `stakeEventTypeEnum` ("deposit" | "withdraw" | "slash")
- `packages/db/src/schema/pg/nodes.ts` — `publicKey: text` column on nodes table (Ed25519
  public key hex, 64 chars); `nodeStakeEvents` table: append-only staking ledger with
  amountUsdc, balanceAfterUsdc, reason, triggeredBy, slashPct, txSignature columns;
  `NodeStakeEvent` / `NewNodeStakeEvent` type exports
- `packages/db/src/schema/pg/receipts.ts` — `nodeSignature: text` (Ed25519 sig, nullable) and
  `signingAlg: text` (null until node binary ships; "ed25519" when present) columns on
  execution_receipts — backward-compatible alongside existing HMAC signature column
- `services/api/src/routes/nodes.ts` — 5 new endpoints:
  - `POST /nodes/:id/public-key` — node submits Ed25519 public key (idempotent, supports rotation)
  - `POST /nodes/:id/stake` — record USDC deposit, updates nodes.stakedUsdc atomically
  - `POST /nodes/:id/unstake` — stake withdrawal; validates balance stays >= tier minimum
  - `POST /nodes/:id/slash` — admin-triggered slash (slashPct%); inserts stake event
  - `GET /nodes/:id/stake` — returns balance + stake event history (paginated)
  Stake minimums enforced: micro=0, edge=100, standard=500, verified=5000, datacenter=25000 USDC

### Added (2026-03-15 — Node earnings / feat/node-earnings)
- `packages/db/src/schema/pg/nodes.ts` — `nodeEarnings` table: append-only
  per-run earnings ledger with 65/20/10/5 split columns (nodeCents,
  developerCents, treasuryCents, validatorCents), billing multiplier,
  token counts, settlement status; indexed by node + status
- `services/daemon/src/orchestrator/analyze.rs` — `record_node_earnings()`
  fires after every successful run; `billing_multiplier()` lookup by model
  prefix; `task_price_cents()` = tokens/1k × 0.2¢ × multiplier + 1¢/run;
  splits total into 65/20/10/5 and inserts into node_earnings (fire-and-forget)
- `services/api/src/routes/nodes.ts` — `GET /nodes/:id/earnings`: returns
  per-run earnings rows + totalPendingCents + totalSettledCents; node owner
  or admin only; filterable by status, paginated

### Added (2026-03-15 — Scheduler v2 + revenue split / feat/scheduler-v2)
- `services/daemon/src/scheduler/mod.rs` — reputation and stake factored into
  node scoring: `(reputation_score / 100) * 20` pts + `min(stake / 1000, 1) * 5` pts
  on top of existing load (50) + model match (30) + GPU (20) factors; max score ~125
- `packages/marketplace/src/index.ts` — added `calcExecutionRevenue()` with the
  correct 65/20/10/5 split (node/developer/treasury/validators) for per-execution
  on-chain task revenue; `calcRevenueShare()` retained for fiat listing sales (70/30)

### Added (2026-03-14 — Marketplace payments / feat/marketplace-payments)
- `packages/billing/src/marketplace.ts` — `createMarketplacePaymentIntent()`:
  creates a pending order + Stripe PaymentIntent for a paid listing; returns
  `{clientSecret, paymentIntentId, orderId}` for Stripe.js confirmation
- `packages/billing/src/webhooks.ts` — handles `payment_intent.succeeded`:
  detects `maschinaProduct: "marketplace_listing"`, completes the order,
  credits seller 70% via credit ledger, increments download count, forks
  the agent config as a new agent owned by the buyer (idempotent)
- `packages/billing/src/index.ts` — exports new marketplace helpers
- `services/api/src/routes/marketplace.ts`:
  - `POST /marketplace/listings/:id/buy` — creates PI, returns clientSecret
  - `GET /marketplace/orders` — buyer purchase history with listing names
  - `GET /marketplace/earnings` — seller earnings total + transaction list

### Added (2026-03-15 — Workflow wiring / feat/workflow-wiring)
- `services/worker/src/worker/workflows/activities.py` — `run_agent_step` fully wired:
  - Fetches agent config (system_prompt, model) + enabled skills from DB via asyncpg
  - Fetches user plan_tier from subscriptions table
  - Generates per-step `run_id` (UUID) for runtime tracing
  - Fixes payload to match `RunRequest`: `input_payload: {"message": prompt}` (was `"prompt"`)
  - Includes all required fields: `run_id`, `plan_tier`, `model`, `system_prompt`, `max_tokens`, `timeout_secs`, `skills`, `skill_configs`
  - Returns normalised `{"step_id", "step_run_id", "output", "output_payload", "input_tokens", "output_tokens"}`
- `packages/sdk/ts/tsconfig.json` — added `"examples"` to include array (fixes red files in IDE)

### Added (2026-03-15 — Agent collaboration / feat/agent-collaboration)
- `packages/runtime/src/maschina_runtime/tools.py` — `DelegateAgentTool`: delegates a subtask to another agent via `POST /internal/delegate`, returns output synchronously; guards against self-delegation
- `packages/runtime/src/maschina_runtime/__init__.py` — exports `DelegateAgentTool`
- `services/runtime/src/config.py` — `MASCHINA_API_URL` + `INTERNAL_SECRET` settings
- `services/runtime/src/skills.py` — `delegate_agent` slug wired; `build_tools()` gains `caller_agent_id` + `user_id` params for delegation context
- `services/runtime/src/runner.py` — passes `caller_agent_id` + `user_id` to `build_tools()`
- `services/api/src/routes/internal.ts` — `POST /internal/delegate`: secret-gated, fetches target agent config + skills, calls runtime synchronously, returns output
- `services/api/src/routes/agents.ts` — `GET /agents/discover`: lists own agents available for delegation (filterable by type)
- `services/api/src/app.ts` — `/internal` routes registered
- `packages/connectors/src/skills.ts` — `delegate_agent` added to SKILL_CATALOG (access+ tier)
- `services/runtime/tests/test_runner_routing.py` — `DelegateAgentTool` added to maschina_runtime.tools stub

### Added (2026-03-15 — Reputation / feat/reputation)
- `services/daemon/src/scheduler/mod.rs` — `select_node()` now returns `(String, Option<Uuid>)` (url + node_id)
- `services/daemon/src/runtime/mod.rs` — `dispatch()` renamed to `dispatch_to(state, run, node_url)` — takes explicit URL
- `services/daemon/src/orchestrator/execute.rs` — calls scheduler separately; passes `node_id` to `finalize_run`
- `services/daemon/src/orchestrator/analyze.rs` — `finalize_run` takes `node_id: Option<Uuid>`; fires `update_node_reputation` + `update_agent_reputation` (tokio::spawn, fire-and-forget) after every run outcome
- Node reputation formula: `completed / (completed + failed + timed_out) * 100`, clamped 0–100, frozen at current score until 5+ total tasks
- `packages/db/src/schema/pg/agents.ts` — added `totalRunsCompleted`, `totalRunsFailed`, `reputationScore` columns
- `packages/db/src/schema/sqlite/agents.ts` — same columns mirrored for local dev
- `packages/marketplace/src/index.ts` — `ListingDoc` + `listingToDoc()` gains optional `reputationScore` field
- `packages/search/src/indexes.ts` — marketplace index: `reputationScore` added to filterable + sortable + displayed attributes
- `services/api/src/routes/marketplace.ts` — publish endpoint fetches agent `reputationScore` and includes it in Meilisearch upsert

## [Unreleased - cascade-fallback]

### Added (2026-03-15 — Analytics / feat/analytics)
- `packages/analytics/src/posthog.ts` — PostHog client, lazy-init, typed event helpers (agent.created, agent.run.completed, connector.installed, subscription.upgraded, etc.)\n- `packages/analytics/src/langsmith.ts` — LangSmith HTTP tracing client (startTrace, endTrace, failTrace)\n- `packages/analytics/src/index.ts` — package exports\n- `packages/analytics/package.json` + `tsconfig.json` — new package\n- `services/api/src/routes/analytics.ts` — GET /analytics/overview, /runs, /tokens, /agents/top (M5+ gate)\n- `services/api/src/app.ts` — analytics routes registered\n- `services/runtime/src/tracing.py` — LangSmith async trace wrapper\n- `services/runtime/src/runner.py` — start/end/fail trace around every agent run\n\n### Added (2026-03-15 — Connector integrations / feat/connectors)\n- `packages/connectors/src/definitions.ts` — connector catalog: Slack (OAuth), GitHub (OAuth), Notion (API key), Linear (API key)\n- `packages/connectors/src/crypto.ts` — AES-256-GCM encrypt/decrypt for credential storage\n- `packages/connectors/src/skills.ts` — added slack, github, notion, linear to SKILL_CATALOG\n- `packages/connectors/src/index.ts` — exports crypto + definitions\n- `services/api/src/routes/connectors.ts` — full connector API: definitions list, CRUD, OAuth flow, incoming webhook receivers (Slack, GitHub, Linear signature verification)\n- `services/api/src/app.ts` — connector routes registered at /connectors\n- `packages/runtime/src/maschina_runtime/tools.py` — SlackTool, GitHubTool, NotionTool, LinearTool\n- `services/runtime/src/skills.py` — slack, github, notion, linear wired into build_tools()

### Added (2026-03-14 — Organization management / feat/orgs)
- `packages/validation/src/schemas/org.ts` — `CreateOrgSchema`, `UpdateOrgSchema`, `InviteMemberSchema`, `UpdateMemberRoleSchema`
- `packages/db/src/schema/pg/relations.ts` — `organizationsRelations`, `organizationMembersRelations`, `organizationInvitesRelations`
- `services/api/src/routes/orgs.ts` — full org API: `POST /orgs`, `GET /orgs`, `GET /orgs/:id`, `PATCH /orgs/:id`, `DELETE /orgs/:id`, `GET /orgs/:id/members`, `PATCH /orgs/:id/members/:memberId`, `DELETE /orgs/:id/members/:memberId`, `POST /orgs/:id/invites`, `GET /orgs/:id/invites`, `DELETE /orgs/:id/invites/:inviteId`, `POST /orgs/invites/:token/accept`, `GET /orgs/:id/agents`, `GET /orgs/:id/usage`
- `services/api/src/app.ts` — org routes registered at `/orgs`

### Added (2026-03-14 — Agent sandboxing)
- `packages/runtime/src/maschina_runtime/tools.py` — `CodeExecTool` gains `memory_limit_mb` + `cpu_limit_secs`; applies `resource.setrlimit` (RLIMIT_AS, RLIMIT_CPU, RLIMIT_FSIZE) via `preexec_fn` on Unix; no-op on Windows
- `services/runtime/src/config.py` — `SANDBOX_ENABLED`, `SANDBOX_MEMORY_LIMIT_MB`, `SANDBOX_CPU_LIMIT_SECS` settings
- `services/runtime/src/skills.py` — passes sandbox limits from config when constructing `CodeExecTool`
- `services/runtime/src/models.py` — `RunResponse` gains `sandbox_type: str | None` (`"subprocess_rlimit"` | `"subprocess"` | `None`)
- `services/runtime/src/runner.py` — sets `sandbox_type` in response based on active skills + platform
- `services/daemon/src/runtime/mod.rs` — `RunOutput` gains `sandbox_type: Option<String>`
- `services/daemon/src/orchestrator/analyze.rs` — `persist_success` writes `sandbox_type` to `agent_runs` table
- `.env.example` — sandbox env vars documented

### Added (2026-03-14 — Agent permissions)
- `packages/db/src/schema/pg/enums.ts` — `agentPermissionEnum`: `internet_access`, `code_execution`, `external_api`, `file_read`, `file_write`, `memory_read`, `memory_write`, `send_email`, `send_webhook`
- `packages/db/src/schema/pg/agents.ts` — `agentPermissions` table (agent_id, permission, granted_at, granted_by_user_id); unique index on (agent_id, permission)
- `packages/db/src/schema/pg/relations.ts` — `agentPermissionsRelations`; `agentsRelations` gains `permissions` many-relation
- `services/daemon/src/error.rs` — `PermissionDenied` variant
- `services/daemon/src/orchestrator/evaluate.rs` — `check_skill_permissions()`: `code_exec` → `code_execution`, `web_search`/`http_fetch` → `internet_access`; blocks run if permission absent
- `services/api/src/routes/permissions.ts` — `GET/PUT /agents/:id/permissions`, `DELETE /agents/:id/permissions/:permission`
- `services/api/src/app.ts` — permission routes registered

### Added (2026-03-14 — Proof of Compute verification)
- `services/api/src/routes/receipts.ts` — `POST /receipts/:id/verify`: re-derives HMAC-SHA256 from stored payload and confirms signature matches; returns `{ valid: boolean, receiptId }`
- `.env.example` — `PROOF_SECRET` documented with generation hint

### Added (2026-03-14 — Proof of Compute)
- `packages/db/src/schema/pg/receipts.ts` — `execution_receipts` table (run_id, agent_id, user_id, node_id, model, input_tokens, output_tokens, payload, signature, issued_at)
- `packages/db/src/schema/pg/relations.ts` — `executionReceiptsRelations`; `agentRunsRelations` gains `receipt` many-relation
- `services/daemon/src/receipt.rs` — HMAC-SHA256 signing: canonical JSON payload (sorted keys) → hex signature; `issue_receipt()` inserts receipt post-run (non-fatal)
- `services/daemon/src/orchestrator/analyze.rs` — `issue_receipt()` called after `persist_success` on every completed run
- `services/daemon/src/config.rs` — `proof_secret` field (env: `PROOF_SECRET`, dev fallback)
- `services/daemon/Cargo.toml` — `hmac`, `sha2`, `hex` deps
- `services/api/src/routes/receipts.ts` — `GET /receipts/:id`, `GET /agents/:agentId/receipts`; ownership-gated per userId
- `services/api/src/app.ts` — receipt routes registered

### Added (2026-03-14 — Feature flags)
- `packages/flags/src/flags.ts` — flag registry (`marketplaceEnabled`, `workflowsEnabled`, `memoryEnabled`, `proofOfComputeEnabled`, `nodeRegistrationEnabled`, `distributedComputeEnabled`, `machTeamPlanVisible`, `billingEnabled`, `skillMarketplaceEnabled`, `pluginsEnabled`, `newRunUiEnabled`); `FlagName` union type
- `packages/flags/src/types.ts` — `FlagContext` (userId, orgId, tier, email, attributes), `FlagValue`, `FlagKey`
- `packages/flags/src/client.ts` — `FlagClient.is()` / `FlagClient.all()`; `getFlags(ctx)` — LaunchDarkly (lazy) → Redis cache (TTL 60s) → defaults; `isEnabled()` convenience helper
- `packages/flags/src/flags.test.ts` — tests: defaults, overrides, all(), flag shape
- `.github/workflows/ci.yml` — `@maschina/storage` and `@maschina/flags` added to TS build chain in both ts-typecheck and ts-test jobs

### Added (2026-03-14 — S3/CloudFront object storage)
- `packages/storage/src/client.ts` — `StorageClient`: upload, uploadJson, download, downloadJson, delete, presignedDownload, presignedUpload, publicUrl; CloudFront URL rewriting; MinIO-compatible via `S3_ENDPOINT`; singleton `getStorage()`
- `packages/storage/src/keys.ts` — `StorageKeys`: agentArtifact, taskOutput, upload path helpers
- `packages/storage/src/storage.test.ts` — 12 tests (StorageKeys + publicUrl)
- `packages/storage/package.json` — `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- `services/api/src/routes/storage.ts` — `POST /storage/upload-url`, `GET /storage/download-url`, `DELETE /storage/object`; ownership-gated per userId
- `services/api/src/app.ts` — storage routes registered
- `services/api/Dockerfile` — storage package built in image

### Added (2026-03-14 — Multi-agent workflows)
- `packages/db/src/schema/pg/workflows.ts` — `workflows` + `workflowRuns` tables; `workflowTypeEnum` + `workflowRunStatusEnum` added to enums
- `packages/events/src/types.ts` — `WorkflowRunQueued` + `WorkflowRunCancelled` subjects + data types
- `services/worker/src/worker/workflows/` — Temporal workflow + activities:
  - `agent_workflow.py` — `AgentWorkflow` (@workflow.defn): sequential, parallel, conditional execution strategies
  - `activities.py` — `run_agent_step` (calls runtime /run), `update_run_status` (writes to DB)
  - `temporal_worker.py` — Temporal worker runner (task queue: `maschina-workflows`)
- `services/worker/src/worker/handlers/workflow.py` — NATS handler that starts Temporal workflow via client
- `services/worker/src/worker/main.py` — `asyncio.gather(run_consumer(), run_temporal_worker())`
- `services/worker/pyproject.toml` — added `temporalio>=1.7`
- `services/worker/src/worker/config.py` — added `temporal_url` + `runtime_url`
- `services/api/src/routes/workflows.ts` — full workflow API (CRUD + trigger + run status + cancel)
- `services/api/src/app.ts` — registered workflow routes at `/workflows`

### Added (2026-03-14 — Agent marketplace)
- `packages/marketplace/src/index.ts` — `calcRevenueShare()` (70/30 split), `listingToDoc()` (Meilisearch shape), `generateSlug()`
- `packages/db/src/schema/pg/marketplace.ts` — `agentId` (nullable FK) + `agentConfig` (jsonb snapshot) on `marketplace_listings`; full `marketplaceOrders` + `marketplaceReviews` tables
- `services/api/src/routes/marketplace.ts` — full marketplace API: browse (Meilisearch + DB fallback), get listing+reviews, create/update/publish/unpublish listing, fork agent (copies config snapshot), submit review (requires completed order), seller's own listings
- `services/api/src/app.ts` — registered marketplace routes at `/marketplace`
- `services/api/package.json` — added `@maschina/marketplace` workspace dep

### Added (2026-03-14 — Resource scheduler)
- `services/daemon/src/scheduler/mod.rs` — scored node selection replacing naive "most recent heartbeat" strategy
  - Queries all active nodes with fresh heartbeat in one JOIN (nodes + node_capabilities + latest heartbeat via LATERAL)
  - Scoring: load factor (50pts, proportional to spare capacity), model match (30pts, prefix match on supported_models), GPU bonus (20pts, for ollama/* models on GPU nodes)
  - Nodes at full capacity (`active_task_count >= max_concurrent_tasks`) are excluded from selection
  - Falls back to `RUNTIME_URL` when no nodes available or all at capacity; logs capacity state at DEBUG
- `services/daemon/src/runtime/mod.rs` — replaced `select_node_url()` with `crate::scheduler::select_node(state, model)`; removed dead NodeRow struct
- `services/daemon/src/main.rs` — registered `scheduler` module

### Added (2026-03-14 — Agent skill framework)
- `packages/db/src/schema/pg/agents.ts` — `agent_skills` table (agent_id, skill_name, config, enabled)
- `packages/connectors/src/skills.ts` — skill catalog: `http_fetch` (access+), `web_search` (m1+, Brave API), `code_exec` (m5+, sandboxed subprocess); tier gating helpers `canUseSkill()`, `listSkills()`
- `packages/connectors/src/index.ts` + `package.json` — wired up, deps fixed to `@maschina/plans`
- `packages/runtime/src/maschina_runtime/tools.py` — `WebSearchTool` (Brave Search API, max_results configurable), `CodeExecTool` (subprocess sandbox, timeout configurable, 30s max); `HttpFetchTool` gains optional domain allowlist
- `services/runtime/src/skills.py` — maps skill slugs → Tool instances; reads BRAVE_SEARCH_API_KEY from env
- `services/runtime/src/models.py` — `RunRequest` gains `skills: list[str]` + `skill_configs: dict`
- `services/runtime/src/runner.py` — builds tools from `req.skills` and passes to `AgentRunner` (Anthropic only)
- `services/daemon/src/orchestrator/scan_compat.rs` — `JobToRun` gains `skills: Vec<String>` + `skill_configs`
- `services/daemon/src/orchestrator/scan.rs` — initializes empty skills on `JobToRun`
- `services/daemon/src/orchestrator/evaluate.rs` — queries `agent_skills` table, populates `run.skills` + `run.skill_configs` before execute
- `services/daemon/src/runtime/mod.rs` — `RuntimeRequest` gains `skills` + `skill_configs`, passed through to Python runtime
- `services/api/src/routes/skills.ts` — `GET /skills` (catalog), `GET /agents/:id/skills`, `PUT /agents/:id/skills/:slug`, `DELETE /agents/:id/skills/:slug`; tier-gated on upsert
- `services/api/src/app.ts` — skill routes registered
- `.env.example` — `BRAVE_SEARCH_API_KEY` added

### Added (2026-03-14 — Agent memory)
- `packages/vector/src/collections.ts` — added `agent_memory` collection (1536-dim Cosine)
- `services/runtime/src/memory.py` — episodic memory: retrieve top-k similar memories (Qdrant + OpenAI text-embedding-3-small), store output after each run; all errors swallowed gracefully
- `services/runtime/src/runner.py` — retrieve memories before routing to LLM, inject as memory block in system prompt; store output memory after run
- `services/runtime/src/config.py` — added `qdrant_url`, `qdrant_api_key`, `memory_enabled`, `memory_top_k` settings
- `services/runtime/pyproject.toml` — added `qdrant-client>=1.9` dependency
- `services/api/src/routes/memory.ts` — `GET /agents/:id/memory` (scroll with pagination), `DELETE /agents/:id/memory` (clear all); ownership-gated, graceful on Qdrant unreachable
- `services/api/src/app.ts` — memory routes registered under `/agents`
- `apps/docs/api-reference/agents.mdx` — Agent Memory section added (list + clear endpoints)

### Added (2026-03-14 — Node registry API)
- `services/api/src/routes/nodes.ts` — full node management CRUD: `POST /nodes/register`, `POST /nodes/:id/heartbeat`, `GET /nodes`, `GET /nodes/:id`, `PATCH /nodes/:id`, `DELETE /nodes/:id`
- `services/daemon/src/runtime/mod.rs` — `select_node_url()` queries `nodes` table for most-recently-healthy active node (heartbeat <60s), falls back to `RUNTIME_URL` on miss or error
- `services/api/src/app.ts` — `/nodes` route registered

### Added (2026-03-14 — Meilisearch search)
- `packages/search/src/indexes.ts` — agents index settings updated: `type` and `status` added to searchable/filterable/displayedAttributes
- `packages/search/src/search.test.ts` — unit tests for INDEXES structure, module exports, client singleton
- `services/api/src/routes/search.ts` — `GET /search` route: auth-scoped, supports `q`, `type`, `limit`, `offset`; graceful Meilisearch degradation (returns empty result on unreachable)
- `services/api/src/routes/agents.ts` — Meilisearch sync on agent create/update/delete (fire-and-forget, non-blocking)
- `services/api/src/app.ts` — `/search` route registered
- `services/api/src/index.ts` — `ensureIndexes()` called at startup (non-fatal on failure)
- `services/api/package.json` — `@maschina/search` added as dependency

### Added (2026-03-08 — Model routing)
- `packages/model/src/catalog.ts` — TypeScript model catalog: 3 Anthropic cloud models + 3 Ollama local models, per-tier access gates, billing multipliers (Haiku 1x, Sonnet 3x, Opus 15x, Ollama 0x)
- `packages/model/src/index.ts` — Barrel export
- `packages/model/src/catalog.test.ts` — 20 vitest tests covering multipliers, tier access, validation, resolution
- `packages/model/tsconfig.json` + build script — TS package alongside existing Python code
- `packages/validation` — `RunAgentSchema` gains optional `model` field
- `packages/jobs` — `AgentExecuteJob` gains `model` + `systemPrompt` fields; `dispatchAgentRun` updated
- `services/api` — Model access validation at run dispatch; resolves system prompt from `agent.config.systemPrompt`; passes model + system prompt through job queue
- `services/daemon` — `AgentExecuteJob`, `JobToRun` gain `model` + `system_prompt`; `RuntimeRequest` now sends all fields the Python runtime needs (`plan_tier`, `model`, `system_prompt`, `max_tokens`, `timeout_secs`); URL fixed from `/execute` → `/run`
- `services/daemon` — `RunOutput.payload` renamed to `output_payload` to match Python `RunResponse`
- `services/runtime` — Full model routing in `runner.py`: routes by model ID prefix (ollama/* vs Anthropic), applies billing multiplier, lazy-imports Anthropic client per request; drops global Ollama flag
- `services/runtime/tests/test_runner_routing.py` — Unit tests for multiplier + routing helpers (no real LLM calls)
- CI + pytest scripts updated to include `services/runtime` tests

### Fixed (2026-03-08 — Model routing)
- Daemon was calling `/execute` endpoint on Python runtime — correct endpoint is `/run`
- Daemon `RuntimeRequest` was missing `plan_tier`, `model`, `system_prompt`, `timeout_secs` fields that the Python `RunRequest` model requires

### Fixed (2026-03-07 — Session N+1: backend boot + E2E)
- All 31 TS packages now build clean (`pnpm turbo build --filter='./packages/*'`)
- `packages/cache/src/client.ts` — ioredis ESM default import via `(Redis as any)` constructor cast
- `packages/cache/src/ops.ts` — `import type { Redis as RedisType }` (named type import)
- `packages/validation/src/schemas/agent.ts` — agent type enum updated to match DB: `signal/analysis/execution/optimization/reporting`
- `services/api/src/env.ts` — dotenv loaded via `config()` at module load; Stripe keys optional with empty-string default
- `services/api/src/routes/auth.ts` — `validatePasswordStrength` returns `PasswordValidation` object; check `.valid` not truthiness; `verifyPassword` args were swapped (fixed to `verifyPassword(hash, plain)`)
- `services/api/src/middleware/auth.ts` — `resolveAuth` accepts `Headers` object; was incorrectly passing raw string; fixed to `c.req.raw.headers`
- `services/api/src/routes/billing.ts` — `/billing/portal` now returns 400 for `internal`/`access` tier users (no Stripe customer)
- All API route files — changed `from "drizzle-orm"` → `from "@maschina/db"` for consistent single-instance resolution
- `packages/telemetry/src/sdk.ts` — `PeriodicExportingMetricReader` moved to `@opentelemetry/sdk-metrics`
- `packages/nats/src/streams.ts` — `readonly string[]` spread to mutable array
- `packages/plans/src/gates.ts` — `?? null` for `PlanTier | null` return

### Added (2026-03-07 — TUI launcher)
- `packages/cli/src/tui.rs` — ratatui TUI launcher (`maschina` with no args):
  - Horizontally centered panel (64% width) with rounded borders
  - Service status panel: api (:3000), gateway (:8080), realtime (:4000), runtime (:8000), daemon
  - Status detection: PID file check → port check → stopped
  - PID files at `~/.local/share/maschina/pids/`
  - Auto-refresh every 3s; message banner expires after 5s
  - Keys: `↑↓/jk` navigate, `s` start, `x` stop, `a` start all, `X` stop all, `r` refresh, `q/Esc` quit
  - Workspace detection: start/stop only available when in Maschina project root
  - Log files written to `.maschina/logs/<service>.log`
  - Monochrome palette: White/Gray/DarkGray, no color theme
- `packages/cli/src/main.rs` — `command` is now `Option<Commands>`; `None` launches TUI

### Added (2026-03-07 — CLI + install script)
- `packages/cli` — complete rewrite of `maschina` CLI:
  - `maschina setup` — interactive wizard: API URL, email/password or API key, credential validation, project `.maschina/` init
  - `maschina login` / `maschina logout` — auth commands
  - `maschina status` — connection + account info
  - `maschina doctor` — config, connectivity, and project health checks
  - `maschina agent list|deploy|stop|run` — agent management with correct API types
  - `maschina keys list|create|revoke` — API key management
  - `maschina usage` — quota usage with visual bar chart
  - `maschina logs <run_id>` — run inspection
  - `--json` global flag for scripting/CI output
  - `--profile <name>` for multi-environment configs (each profile: `~/.config/maschina/<profile>.toml`)
  - `arg_required_else_help = true` (shows help instead of panicking on no args)
  - `src/output.rs` — unified human/JSON output layer
  - `src/project.rs` — `.maschina/config.toml` per-project config (name, description, agent defaults, runtime URL)
- `install.sh` — curl installer:
  - Detects OS (macOS/Linux) and architecture (x86_64/aarch64)
  - Checks required dependencies (curl, tar)
  - Downloads release binary from GitHub
  - Installs to `/usr/local/bin` or `~/.local/bin`
  - Adds to PATH in shell rc file (zsh/bash/fish)
  - Runs `maschina setup` automatically if interactive TTY

### Added (2026-03-07 — CLI full build)
- `packages/cli/src/services.rs` — shared service management module (PID files, port checks, probe, start/stop, log paths); `start_svc` checks `~/.local/share/maschina/bin/` first (installed), falls back to workspace dev mode
- `packages/cli/src/tui.rs` — complete rewrite: borderless two-zone launcher (Services + Menu), deimos-style centered `Rect`, `▸` cursor, spinner animation, responsive column collapse, Tab/j/k/s/x/l/Enter/r/q controls; returns `LaunchTarget` for post-TUI dispatch
- `packages/cli/src/commands/service.rs` — `start/stop/restart/status/logs` using shared `services::` module; `--json` support
- `packages/cli/src/commands/setup.rs` — 5-step interactive wizard: connection → account (login/register/paste) → AI providers (MultiSelect: Anthropic/OpenAI/Ollama/OpenRouter/Gemini/Mistral) → database (SQLite/Postgres/Neon) → workspace init
- `packages/cli/src/commands/agent.rs` — added `runs()` (run history table) and `inspect()` (detailed agent view)
- `packages/cli/src/config.rs` — added `db_url: Option<String>` and `model_providers: Vec<ModelProvider>`
- `packages/cli/src/main.rs` — full rewrite: comprehensive command tree (setup/login/logout/status/doctor/service/agent/keys/models/usage/logs/update/code/config); TUI launcher on no-args; `LaunchTarget` dispatch
- `install.sh` — service binary download step: downloads `maschina-services-<os>-<arch>.tar.gz` to `~/.local/share/maschina/bin/`; graceful fallback if not in release

### Fixed (2026-03-07 — CLI compilation)
- `packages/cli/src/commands/login.rs` — `Config` struct initializers now include `db_url` and `model_providers` fields
- `packages/cli/src/config.rs` — default `Config` in `load()` now includes `db_url: None, model_providers: vec![]`
- `packages/cli/src/commands/agent.rs` — `AgentRun` struct now has `started_at: Option<String>`

### Added (2026-03-07 — Session N+1)
- Kill commands in root `package.json`: `kill:api`, `kill:gateway`, `kill:realtime`, `kill:runtime`, `kill:daemon`, `kill:all`
- `"type": "module"` added to all TS packages missing it (ESM consistency)
- Dotenvy env loading in `services/gateway`, `services/realtime`, `services/daemon` Rust services

### Added (2026-03-07 — Session N: shared packages + app wiring)
- `packages/api-client` — shared fetch client (`api.get/post/patch/put/delete`), `ApiError`, `token` helpers (localStorage); base URL from `VITE_API_URL`
- `packages/query` — TanStack Query hooks: `useAgents`, `useAgent`, `useAgentRuns`, `useCreateAgent`, `useUpdateAgent`, `useDeleteAgent`, `useRunAgent`, `useLogin`, `useRegister`, `useLogout`, `useForgotPassword`, `useResetPassword`, `useSubscription`, `useCredits`, `useCreateCheckout`, `useCancelSubscription`, `useKeys`, `useCreateKey`, `useRevokeKey`, `useUsageSummary`, `useUsageEvents`, `useMe`, `useUpdateMe`, `useUsers`
- `packages/ui/src/index.ts` — full barrel export of all 55 shadcn components
- All 6 web apps (`app`, `auth`, `admin`, `console`, `developers`, `web`) — added `@maschina/api-client` and `@maschina/query` workspace deps
- All 6 web apps — `src/lib/api.ts` replaced with re-export from `@maschina/api-client` (eliminates duplication)
- All 6 web apps — `__root.tsx` wrapped with `<TooltipProvider>` from `@maschina/ui`
- `apps/docs` — switched from Docusaurus to Mintlify; `mint.json` + `introduction.mdx` + full doc structure
- `.github/workflows/deploy.yml` — fixed invalid `push_tag:` event (moved `tags: ["v*"]` under `push:`)
- All 6 web apps — `tsconfig.app.json` + `tsconfig.node.json` — added `"composite": true`; removed deprecated `"baseUrl": "."`
- `packages/tsconfig/package.json` — added `.json`-suffixed exports to fix `@maschina/tsconfig/node.json` resolution
- `apps/*/src/routeTree.gen.ts` — stub files for TypeScript compile before first `pnpm dev`
- `apps/desktop/src-tauri/icons/` — full icon set: `icon.icns`, `icon.ico`, Windows Store tiles, 32/128/256px PNGs
- `apps/mobile/android/` — adaptive icons (foreground PNG + black background XML), all mipmap densities
- `apps/mobile/android/wear/` — Wear OS module: `MainActivity`, `WearViewModel`, `WearApp`, `WatchStore`, Compose UI
- `apps/mobile/ios/MaschinaWatch/` — watchOS app: `WatchStore` (WCSession), agents list, status view, 5 complication families

### Added (2026-03-06 — Session 2)
- `packages/db/src/schema/pg/` — full PostgreSQL schema (20 modules): enums, users, auth, organizations, plans, subscriptions, api_keys, usage, credits, agents, audit, jobs, billing_events, compliance, webhooks, notifications, connectors, marketplace, misc, index
- `packages/db/src/schema/sqlite/` — full SQLite mirror schema (8 modules): users, auth, plans, subscriptions, api_keys, usage, agents, compliance, index; all pg-incompatible types replaced (sqliteTable, text enums, integer timestamps/booleans, text UUIDs, text JSON)
- `packages/db/src/client.ts` — dual-dialect client: auto-detects `file:` prefix → SQLite (WAL + FK + busy_timeout), else → PostgreSQL (ssl for neon.tech, connection pooling)
- `packages/db/drizzle.config.ts` — dialect-aware: points to pg/ or sqlite/ schema dir, separate migrations/pg and migrations/sqlite outputs
- `packages/db/src/index.ts` — exports pg schema as canonical types; named re-exports for `pgSchema` and `sqliteSchema`
- `packages/db/src/rls/policies.sql` — full Row Level Security: 3 DB roles (maschina_app, maschina_readonly, maschina_migrate), RLS enabled on 24 tables, user isolation policies via `app.current_user_id` session variable, BYPASSRLS for migrate role
- `packages/db/src/seed/plans.ts` — idempotent plan seed using `onConflictDoUpdate` on tier; imports from `@maschina/plans` (canonical definitions)
- `packages/db/src/seed/index.ts` — seed runner
- `packages/auth/src/types.ts` — UserRole, PlanTier, AuthContext, JwtPayload, TokenPair types
- `packages/auth/src/jwt.ts` — HS256 access tokens (15min), refresh tokens (30d) with separate secret, createTokenPair, generateSecureToken, hashToken
- `packages/auth/src/password.ts` — argon2id (64MiB/3iter/4para), validatePasswordStrength, needsRehash
- `packages/auth/src/api-key.ts` — `msk_live_`/`msk_test_` prefix format, SHA-256 hash, timingSafeEqual comparison
- `packages/auth/src/session.ts` — createSession, rotateSession (delete-on-use prevents reuse), revokeSession, revokeAllSessions, pruneExpiredSessions
- `packages/auth/src/validate.ts` — resolveAuth: auto-detects API key vs JWT from Bearer header
- `packages/auth/src/rbac.ts` — ROLE_HIERARCHY, PLAN_HIERARCHY, planFeatures, requireRole, requirePlan helpers
- `packages/auth/src/verification.ts` — email verification (24h), password reset (1h) single-use tokens
- `packages/auth` tests — jwt.test.ts, password.test.ts, api-key.test.ts, rbac.test.ts
- `packages/plans/src/types.ts` — PlanTier, PlanLimits, PlanFeatures, PlanConfig, QuotaKey, QuotaStatus types
- `packages/plans/src/definitions.ts` — canonical plan configs (Free/Operator/Pro/Enterprise) with token budgets; PLANS record, getPlan, isValidTier
- `packages/plans/src/gates.ts` — hasFeature, isAtLeastTier, nextTier, `can.*` helpers, getUpgradeHints
- `packages/plans/src/quotas.ts` — getQuotaStatus, withinQuota, canConsumeQuota, getAllQuotas, QUOTA_LABELS, formatLimit
- `packages/plans/src/training.ts` — GDPR/CCPA training consent config: TRAINING_POLICY_VERSION, consent text, jurisdiction list, per-tier default consent, TrainingDataConfig, PII_CATEGORIES, data retention policy
- `packages/validation/` — new package: Zod schemas + sanitization + output projection
  - `src/sanitize.ts` — sanitizeText, sanitizeSlug, sanitizeFilename, sanitizeUrl, enforceLength; server-side only, no DOM
  - `src/project.ts` — projectUser, projectApiKey, projectSession, projectAgent, projectSubscription; explicit field allowlists, sensitive fields never exposed
  - `src/parse.ts` — parseBody, assertValid, ValidationError; safe Zod wrapper with FieldError formatting
  - `src/schemas/auth.ts` — RegisterSchema, LoginSchema, ChangePasswordSchema, ResetPasswordSchema, OAuthCallbackSchema
  - `src/schemas/user.ts` — UpdateProfileSchema, CreateApiKeySchema, UpdateTrainingConsentSchema, RequestDataExportSchema, DeleteAccountSchema
  - `src/schemas/agent.ts` — CreateAgentSchema, RunAgentSchema, CreateConnectorSchema, CreateWebhookSchema
- `CLAUDE.md` — updated with strict session protocol: mandatory CHANGELOG + decisions.md updates during session
- `.claude/settings.json` — added PostToolUse hooks that write to `.claude/change-audit.log` on every Write/Edit

### Added (2026-03-06 — Session 2, continued)
- `services/api/` — Hono HTTP server (Node.js)
  - `src/env.ts` — Zod env validation, fails fast on startup with clear error
  - `src/context.ts` — typed Hono context: RequestUser (id/email/role/tier/sessionId/apiKeyId), Variables
  - `src/app.ts` — Hono app factory with global middleware + all route mounts (exported for tests)
  - `src/index.ts` — Node.js server entry, graceful SIGTERM/SIGINT shutdown, closes Redis cleanly
  - `src/middleware/auth.ts` — requireAuth (JWT + API key), optionalAuth, requireRole, requireFeature
  - `src/middleware/quota.ts` — requireQuota(type), trackApiCall (applied to all authed routes)
  - `src/middleware/ratelimit.ts` — Redis sliding window: authRateLimit (10/min), apiRateLimit (300/min), strictLimit (5/5min)
  - `src/middleware/error.ts` — global error handler: ValidationError→400, QuotaExceededError→429, unknown→500
  - `src/middleware/cors.ts` — configurable CORS, strict in production
  - `src/routes/health.ts` — GET /health, GET /ready (DB + Redis liveness)
  - `src/routes/auth.ts` — register, login, refresh, logout, verify-email, forgot-password, reset-password
  - `src/routes/users.ts` — /users/me profile, sessions list/revoke, training consent, GDPR export, account deletion
  - `src/routes/agents.ts` — agents CRUD + POST /agents/:id/run (quota enforced, dispatches to daemon)
  - `src/routes/keys.ts` — API key CRUD (full key shown once on creation, never again)
  - `src/routes/usage.ts` — GET /usage (current period quotas), GET /usage/history (paginated events)
  - `src/routes/billing.ts` — subscription info, checkout, plan change, cancel, portal, balance, top-up, history
  - `src/routes/webhooks.ts` — POST /webhooks/stripe (raw body, signature verified before processing)
  - `src/jobs/reconcile.ts` — nightly Redis→PostgreSQL usage reconciliation, standalone runnable
- `packages/billing/src/pricing.ts` — per-action pricing rates in cents ($2.00/1M tokens, $0.01/agent run, $0.10/GB/month), calculateCost(), TOPUP_OPTIONS ($5/$10/$20/$50/$100), MIN_TOPUP_CENTS ($5 minimum matching Anthropic)
- 7 plan tiers finalized: Access / Mach-1 (M1) / Mach-5 (M5) / Mach-10 (M10) / Teams / Enterprise / Internal
  - Access: $0 — free, local Ollama only, onboarding tier
  - M1: $20/mo or $204/yr ($17/mo) — entry paid, Maschina model unlocked
  - M5: $60/mo or $600/yr ($50/mo) — main individual tier
  - M10: $100/mo or $995/yr (~$83/mo) — power user, compliance + priority support
  - Teams: $20/seat/mo or $204/seat/yr ($17/seat/mo)
  - Enterprise: custom pricing, contact sales
  - Internal: $0, unlimited, Asher + team only, never shown publicly, no billing/quota checks
- Prepaid balance model: $5 minimum top-up, depletes by cent, rolls over indefinitely, manual refund button (no auto-refund)
- `packages/billing/` — full Stripe billing integration
  - `src/types.ts` — BillingInterval, SubscriptionStatus, CreditPackage, CREDIT_PACKAGES (1M/5M/20M token packs), CheckoutResult, PortalResult
  - `src/client.ts` — Stripe singleton (telemetry disabled)
  - `src/customers.ts` — getOrCreateStripeCustomer (lazy creation, stored in subscriptions table), updateStripeCustomer
  - `src/subscriptions.ts` — createSubscriptionCheckout (Stripe Checkout hosted page), changeSubscriptionTier (immediate proration), cancelSubscription (at period end only), createPortalSession (Stripe Customer Portal for self-serve)
  - `src/credits.ts` — createCreditCheckout, getCreditBalance, addCredits (ledger + balance in DB transaction), consumeCredits
  - `src/webhooks.ts` — constructWebhookEvent (signature verification), handleWebhookEvent (idempotent via stripeEventId unique), routes: subscription.created/updated/deleted, invoice.paid/payment_failed, checkout.session.completed
- `packages/cache/` — Redis abstraction over ioredis: client singleton with reconnect backoff, typed ops (get/set/del/incr/decr/getJson/setJson/pipeline/multi/publish), TTL helpers (secondsUntilEndOfMonth, currentMonthKey)
- `packages/usage/` — full usage metering and quota enforcement
  - `src/types.ts` — UsageEventType, RecordUsageInput, QuotaCheckResult, UsageSummary, RateLimitHeaders
  - `src/period.ts` — UTC calendar-month period helpers (getCurrentPeriod, getPeriodForDate, secondsUntilPeriodEnd)
  - `src/keys.ts` — Redis key schema: `quota:{userId}:{type}:{YYYY-MM}`, session/plan cache keys
  - `src/quota.ts` — checkQuota (Redis → PostgreSQL cold-start fallback), incrementQuota (atomic INCRBY + expire), getUsageSummary, buildRateLimitHeaders (X-RateLimit-* headers)
  - `src/record.ts` — recordUsage (Redis incr + PostgreSQL fire-and-forget), recordModelInference (input+output tokens from model response), recordAgentExecution, recordApiCall
  - `src/storage.ts` — getStorageUsageGb (PostgreSQL snapshot, not Redis), checkStorageQuota
  - `src/reconcile.ts` — reconcileUserUsage, reconcileAllUsers (nightly Redis→PostgreSQL checkpoint sync)
  - `src/middleware.ts` — QuotaExceededError (429), enforceQuota, enforceAndRecordApiCall

### Changed (2026-03-06 — Session 2, continued)
- `packages/db/src/schema/pg/usage.ts` — added inputTokens/outputTokens columns to usage_events; changed rollup index to uniqueIndex (required for ON CONFLICT DO UPDATE upserts); updated comment to reflect Redis-first architecture
- `packages/db/src/schema/sqlite/usage.ts` — added inputTokens/outputTokens columns to match pg schema

### Fixed (2026-03-06 — Session 2)
- `packages/auth/src/session.ts` — `pruneExpiredSessions`: changed `gt(new Date(), sessions.expiresAt)` → `lt(sessions.expiresAt, new Date())` (correct Drizzle column-first argument order)
- `packages/plans/src/index.ts` — corrected `.ts` extension to `.js` in ESM import

### Changed (2026-03-06 — Session 2)
- Plan `monthlyModelInferences` (call count) → `monthlyModelTokens` (token budget): Free=0, Operator=500k, Pro=5M, Enterprise=-1 (unlimited). Aligns with how all real AI platforms meter usage.

### Added (2026-03-06 — Session 1)
- Full monorepo scaffold: pnpm + Turborepo + polyglot (TypeScript, Python, Rust)
- Rust workspace: daemon, gateway, realtime, CLI, code tool, SDK
- Python packages: runtime (FastAPI), agents, ml (PyTorch), risk
- TypeScript packages: types, core, db (Drizzle), auth, billing, plans, usage, keys,
  payments, cache, events, jobs, storage, notifications, webhooks, ratelimit, flags,
  errors, search, crypto, chain, compliance, reputation, marketplace, treasury,
  connectors, telemetry, config, content, ui, sdk/ts, sdk/python
- TypeScript services: api, analytics, email
- Rust services: daemon, gateway, realtime
- Python services: worker (Celery)
- Solana Anchor programs: treasury, marketplace
- Docker Compose: PostgreSQL 17 + Redis 7
- Biome for TypeScript/JSON linting and formatting
- Vitest for TypeScript testing, pytest for Python, cargo test for Rust
- GitHub Actions CI: TypeScript + Rust + Python jobs
- Local CI via git hooks (pnpm hooks:install)
- Comprehensive root package.json with 100+ pnpm commands
- Drizzle ORM with dual-dialect support (PostgreSQL + SQLite)
- Billing model scaffold: plans (Free/Operator/Pro/Enterprise), metered usage, API keys
- CLAUDE.md for persistent AI session context (gitignored)
- `.claude/` folder: `context.md`, `decisions.md`, `session.md` for full audit trail
- `.env.example` with all environment variables documented
- All TS package stubs: `tsconfig.json`, `src/index.ts`, `vitest.config.ts` (34 packages)
- All Python package stubs: `src/maschina_*/__init__.py`
- All Rust stubs: `src/main.rs` (daemon, gateway, realtime, cli, code), `src/lib.rs` (sdk/rust)
- Rust SDK: `MaschinaError`, `Agent`, `AgentType`, `AgentStatus` types
- CLI: `maschina init`, `agent`, `keys` command structure (clap)
- Root: `vitest.workspace.ts`, `rust-toolchain.toml`, `.python-version`, `pyproject.toml`
- `packages/model`: GLM-4 fine-tuning scaffold (train, eval, infer, data, config)
- `packages/db` schemas: users, plans, subscriptions, api_keys, usage_events, usage_rollups, credit_transactions, credit_balances, agents, agent_runs
- `packages/db` client: dual-dialect PostgreSQL/SQLite with Drizzle
