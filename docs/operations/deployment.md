# Deployment

---

## Deployment Phases

| Phase | Infrastructure | Scale |
|---|---|---|
| 1 — Launch | Fly.io + Neon + Redis + Docker | Now → ~10k users |
| 2 — Growth | Fly.io + Kubernetes | 10k → 100k users |
| 3 — Scale | AWS ECS/EKS + Neon or RDS + ElastiCache | 100k+ / Series A |

S3 + CloudFront are used from Phase 1 onward — storage and CDN do not change across phases.

---

## Container Builds

All services are containerized with multi-stage Dockerfiles. Build with:

```bash
# Build a single service image
docker build -f services/api/Dockerfile -t maschina-api .

# Build all service images
docker compose -f docker/docker-compose.prod.yml build
```

### Dockerfile patterns

**TypeScript services (Node):**
```
Stage 1 (deps):    node:22-alpine — install pnpm + prod deps
Stage 2 (builder): install all deps + build
Stage 3 (runner):  node:22-alpine — copy dist + prod node_modules, run
```

**Rust services:**
```
Stage 1 (builder): rust:1.82-slim — cargo build --release
Stage 2 (runner):  debian:bookworm-slim — copy binary, run
```

**Python services:**
```
Stage 1 (builder): python:3.12-slim — uv pip install
Stage 2 (runner):  python:3.12-slim — copy venv + source, run with uvicorn
```

---

## Fly.io Deployment (Phase 1)

### Service machine sizes

| Service | Machine | Memory |
|---|---|---|
| `services/gateway` | `shared-cpu-2x` | 512 MB |
| `services/api` | `shared-cpu-2x` | 512 MB |
| `services/daemon` | `performance-2x` | 2 GB |
| `services/realtime` | `shared-cpu-2x` | 512 MB |
| `services/runtime` | `performance-4x` | 4 GB |

### Deploy a service

```bash
# Deploy single service
cd services/api
fly deploy

# Deploy all services (from root)
./scripts/deploy-all.sh

# Check deployment status
fly status -a maschina-api
fly logs -a maschina-api
```

### Secrets on Fly.io

Secrets are managed via Doppler and synced to Fly:

```bash
# Set a secret on Fly
fly secrets set JWT_SECRET="..." -a maschina-api

# Or sync all from Doppler
doppler secrets download --no-file --format env | fly secrets import -a maschina-api
```

### Internal networking

Services communicate over Fly's 6PN private IPv6 network:

```
services/gateway → maschina-api.internal:3000
services/gateway → maschina-realtime.internal:4000
services/daemon  → maschina-runtime.internal:8001
```

---

## Environment Promotion

| Environment | Branch | Deployment | Database |
|---|---|---|---|
| Local | any | Docker Compose | SQLite or Neon dev branch |
| Preview | PR branch | Fly.io preview app | Neon branch (auto-created per PR) |
| Staging | `main` | Fly.io staging | Neon staging branch |
| Production | release tag | Fly.io production | Neon main branch |

### Preview environments

PRs automatically get a Neon database branch via the Neon GitHub integration. Preview apps run on Fly.io review apps. Both are torn down when the PR closes.

---

## Release Workflow

1. All changes merge to `main` via squash merge
2. CI runs full test suite on `main`
3. On green CI, tag the release: `git tag v1.2.3`
4. CI deploys tagged commit to production
5. Run smoke tests against production (`k6 run k6/smoke.js --env BASE_URL=https://api.maschina.ai`)
6. Monitor Grafana + Sentry for 15 minutes post-deploy

### Database migration on deploy

Migrations run automatically as a release command before the new service starts:

```toml
# fly.toml (services/api)
[deploy]
  release_command = "pnpm db:migrate"
```

This ensures migrations complete before any new API instance starts serving traffic.

---

## Rollback

```bash
# Roll back to previous image
fly releases list -a maschina-api
fly deploy --image <previous-image-ref> -a maschina-api
```

Database migrations are forward-only. Rollback the application code only — never roll back migrations in production.

---

## AWS Deployment (Phase 3)

When transitioning to AWS:

- **Compute**: ECS Fargate (or EKS for k8s-native workloads)
- **Database**: Neon (continue) or RDS PostgreSQL
- **Cache**: ElastiCache Redis
- **Networking**: VPC with private subnets, ALB for gateway
- **Container registry**: Amazon ECR
- **IaC**: Terraform (`infra/terraform/aws/`)

Fly.io and AWS stay in the stack simultaneously during migration. Cut over service by service.
