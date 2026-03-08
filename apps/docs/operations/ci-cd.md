# CI/CD

---

## Pipeline Overview

All CI/CD runs on **GitHub Actions**. Three workflows:

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push to any branch, PR | Lint, typecheck, test, build |
| `deploy.yml` | Push to `main`, release tag | Deploy to staging or production |
| `preview.yml` | PR opened/updated | Deploy preview environment |

---

## CI Workflow — `ci.yml`

Must pass on every PR before merging.

### Jobs

```
validate
  ├── typecheck      pnpm typecheck
  ├── lint           pnpm lint (Biome)
  ├── lint-rust      cargo clippy -- -D warnings
  └── lint-python    ruff check .

test
  ├── test-ts        pnpm test (Vitest)
  ├── test-rust      cargo test
  └── test-python    pytest

build
  ├── build-ts       pnpm build
  ├── build-rust     cargo build --release
  └── build-python   uv pip install -e .

e2e  (PR only, against preview env)
  └── playwright     pnpm playwright test
```

---

## Deploy Workflow — `deploy.yml`

### Staging (push to `main`)

1. Build Docker images, push to `ghcr.io/rustmunkey/maschina/*`
2. `fly deploy` for each service
3. Run smoke tests against staging
4. Notify on failure

### Production (release tag `v*`)

Same steps targeting production Fly apps. Manual tag push required — no auto-deploy to production on `main`.

---

## Preview Workflow — `preview.yml`

On PR open/update:
1. Create Neon database branch for the PR
2. Deploy Fly review apps
3. Run migrations against the Neon branch
4. Post preview URLs as PR comment

On PR close — tear down apps and Neon branch.

---

## Artifact Publishing

### Docker images

Registry: `ghcr.io/rustmunkey/maschina/<service>`

Tags: `latest` (main), `sha-<git-sha>` (immutable), `v1.2.3` (release)

### Rust binaries

`maschina-cli` and `maschina-code` attached to GitHub Releases:

| Target | Platform |
|---|---|
| `x86_64-unknown-linux-musl` | Linux x64 (static) |
| `aarch64-unknown-linux-musl` | Linux ARM64 (static) |
| `x86_64-apple-darwin` | macOS Intel |
| `aarch64-apple-darwin` | macOS Apple Silicon |
| `x86_64-pc-windows-msvc` | Windows x64 |

Built with `cross` for cross-compilation.

---

## Cache Strategy

```yaml
# pnpm store
- uses: actions/cache@v4
  with:
    path: ~/.pnpm-store
    key: pnpm-${{ hashFiles('pnpm-lock.yaml') }}

# Cargo registry
- uses: actions/cache@v4
  with:
    path: ~/.cargo/registry
    key: cargo-${{ hashFiles('Cargo.lock') }}
```

Turborepo remote cache skips rebuilding unchanged packages.

---

## Secrets in CI

Stored as GitHub Actions secrets, synced from Doppler:

```yaml
env:
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
  NEON_API_KEY: ${{ secrets.NEON_API_KEY }}
```

Never `set -x` in steps that access secrets.
