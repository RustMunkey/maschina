# CI/CD

---

## Workflows

All CI/CD runs on **GitHub Actions**.

| Workflow | File | Trigger | Purpose |
|---|---|---|---|
| CI | `ci.yml` | Push to any branch, PR to main | Lint, typecheck, test, build gate |
| Deploy | `deploy.yml` | Push to `main`, release tag | Multi-arch Docker build + Fly.io deploy |
| Release | `release.yml` | Push tag `v*` | Build CLI binaries for all platforms, attach to GitHub Release |
| Semantic Release | `semantic-release.yml` | Push to `main` | Auto-publish versioned release via conventionalcommits |
| CodeQL | `codeql.yml` | Weekly + on PR | TS + Python static analysis |
| Secrets Scan | `secrets-scan.yml` | Every push | TruffleHog `--only-verified` scan |
| Stale | `stale.yml` | Scheduled | Mark issues/PRs stale at 30d, close at 37d |
| Dependabot Auto-merge | `dependabot-auto-merge.yml` | Dependabot PR | Auto-merge patch/minor GHA dependency updates |

---

## CI Workflow — `ci.yml`

Must pass on every PR before merging. All jobs run in parallel; `ci-pass` is the gate job that requires all others.

### Jobs

| Job | Command | What it checks |
|---|---|---|
| `ts-typecheck` | `pnpm typecheck` | TypeScript type correctness across all packages |
| `ts-lint` | `pnpm exec biome check packages/ services/` | Biome lint + format for all TS/JSON |
| `ts-test` | `pnpm exec vitest run --coverage` | Vitest unit tests with v8 coverage |
| `rust-fmt` | `cargo fmt -p maschina-gateway -p maschina-daemon -p maschina-realtime -- --check` | Rust formatting |
| `rust-clippy` | `cargo clippy ... -- -D warnings` | Rust lint (warnings = errors) |
| `rust-test` | `cargo test -p maschina-gateway -p maschina-daemon -p maschina-realtime` | Rust unit tests |
| `rust-build` | `cargo build --release ...` | Release build (catches link errors) |
| `python-lint` | `ruff check` + `ruff format --check` | Python lint + format |
| `python-test` | `pytest packages/runtime/tests packages/agents/tests packages/risk/tests packages/sdk/python/tests services/runtime/tests` | Python unit tests |
| `ci-pass` | Gate job | Fails if any required job above failed or was cancelled |

### Build order in CI

TypeScript packages are built in dependency order before typecheck and test jobs run:

```
db → auth → cache → plans → events → nats → jobs → model →
telemetry → usage → billing → notifications → validation → email
```

### Services in CI

The `ts-test` job runs PostgreSQL (16-alpine), Redis (7-alpine), and NATS (2-alpine with JetStream) as Docker service containers. `DATABASE_URL`, `REDIS_URL`, `NATS_URL`, and `JWT_SECRET` are set as env vars.

---

## Deploy Workflow — `deploy.yml`

### On push to `main`

1. Build multi-arch Docker images (`linux/amd64` + `linux/arm64`)
2. Push to `ghcr.io/rustmunkey/maschina/<service>`
3. `fly deploy` for each service
4. Notify via Slack webhook (when `SLACK_DEPLOY_WEBHOOK` secret is set)

### On release tag `v*`

Same steps targeting production Fly apps.

### Docker image tags

| Tag | When |
|---|---|
| `latest` | Every push to main |
| `sha-<git-sha>` | Immutable per-commit tag |
| `v1.2.3` | On release tag |

---

## Release Workflow — `release.yml`

Triggered on `v*` tags. Builds the `maschina` CLI binary for all platforms using `cross` for cross-compilation.

| Target | Platform |
|---|---|
| `x86_64-unknown-linux-musl` | Linux x64 (static) |
| `aarch64-unknown-linux-musl` | Linux ARM64 (static) |
| `x86_64-apple-darwin` | macOS Intel |
| `aarch64-apple-darwin` | macOS Apple Silicon |
| `x86_64-pc-windows-msvc` | Windows x64 |

Binaries are attached to the GitHub Release.

---

## Semantic Release — `semantic-release.yml`

Runs on every push to `main`. Uses `conventionalcommits` preset to determine version bump from commit messages and auto-publishes a tagged GitHub release.

- `fix:` → patch bump
- `feat:` → minor bump
- `feat!:` or `BREAKING CHANGE:` → major bump

---

## Branch Strategy

- Feature branches: `feat/<name>`
- All merges to `main` via squash merge
- Never commit directly to `main`
- Semantic release auto-publishes on every green `main` push

---

## Secrets in CI

Stored as GitHub Actions secrets:

| Secret | Required by |
|---|---|
| `JWT_SECRET` | `ts-test` job |
| `FLY_API_TOKEN` | `deploy.yml` (add when ready to deploy) |
| `SLACK_DEPLOY_WEBHOOK` | `deploy.yml` notify step (optional) |

Never use `set -x` in steps that access secrets.
