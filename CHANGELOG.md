# Changelog

All notable changes to Maschina will be documented here.

Format: [Semantic Versioning](https://semver.org) — `[version] YYYY-MM-DD`

---

## [Unreleased]

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
