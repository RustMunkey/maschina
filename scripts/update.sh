#!/usr/bin/env bash
# scripts/update.sh — Auto-update Maschina node from main branch.
#
# Checks for new commits every run. If changes are detected:
#   - Pulls latest code
#   - Rebuilds affected services (Docker images)
#   - Rebuilds CLI binary if packages/cli changed
#   - Runs DB migrations if schema changed
#   - Restarts services with zero manual intervention
#
# Designed to be run by a systemd timer every 5 minutes.
# Safe to run manually at any time.

set -euo pipefail

# ── Environment ───────────────────────────────────────────────────────────────
# Systemd runs with a minimal PATH — wire in everything we need.
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$HOME/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin"
source "$HOME/.cargo/env" 2>/dev/null || true

REPO_DIR="${MASCHINA_DIR:-$HOME/Desktop/maschina}"
COMPOSE_SERVICES="-f docker/docker-compose.yml -f docker/docker-compose.services.yml"
DATABASE_URL="${DATABASE_URL:-postgresql://maschina:maschina@localhost:5432/maschina}"
BIN_DIR="$HOME/.local/bin"
LOG_TAG="maschina-update"

log()     { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$LOG_TAG] $*"; }
log_err() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$LOG_TAG] ERROR: $*" >&2; }

cd "$REPO_DIR"

# ── Check for updates ─────────────────────────────────────────────────────────

log "checking for updates..."

git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [[ "$LOCAL" == "$REMOTE" ]]; then
  log "already up to date ($LOCAL)"
  exit 0
fi

log "update available: $LOCAL -> $REMOTE"

# ── Detect what changed ───────────────────────────────────────────────────────

CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")

needs_rebuild_api()      { echo "$CHANGED" | grep -qE '^(services/api|packages/)'; }
needs_rebuild_gateway()  { echo "$CHANGED" | grep -qE '^services/gateway'; }
needs_rebuild_realtime() { echo "$CHANGED" | grep -qE '^services/realtime'; }
needs_rebuild_daemon()   { echo "$CHANGED" | grep -qE '^services/daemon'; }
needs_rebuild_runtime()  { echo "$CHANGED" | grep -qE '^(services/runtime|packages/runtime|packages/agents|packages/risk|packages/ml)'; }
needs_rebuild_worker()   { echo "$CHANGED" | grep -qE '^services/worker'; }
needs_rebuild_cli()      { echo "$CHANGED" | grep -qE '^(packages/cli|packages/code)'; }
needs_migrate()          { echo "$CHANGED" | grep -qE '^packages/db/migrations/'; }

# ── Pull ──────────────────────────────────────────────────────────────────────

log "pulling latest..."
git pull --ff-only origin main

# ── Migrate ───────────────────────────────────────────────────────────────────

if needs_migrate; then
  log "running migrations..."
  # Apply any SQL files not yet tracked in drizzle.__drizzle_migrations
  # We run each file via psql — drizzle's own CLI has ESM resolution issues.
  APPLIED=$(docker exec maschina-postgres psql -U maschina -d maschina -t \
    -c "SELECT hash FROM drizzle.__drizzle_migrations;" 2>/dev/null || echo "")
  for sql_file in packages/db/migrations/pg/*.sql; do
    tag=$(basename "$sql_file" .sql)
    file_hash=$(sha256sum "$sql_file" | awk '{print $1}')
    if ! echo "$APPLIED" | grep -q "$file_hash"; then
      log "applying migration: $tag"
      docker exec -i maschina-postgres psql -U maschina -d maschina < "$sql_file"
    fi
  done
  log "migrations complete"
fi

# ── Rebuild CLI if changed ────────────────────────────────────────────────────

if needs_rebuild_cli; then
  log "rebuilding CLI..."
  cargo build --release -p maschina-cli --manifest-path "$REPO_DIR/Cargo.toml"
  cp "$REPO_DIR/target/release/maschina" "$BIN_DIR/maschina"
  log "CLI updated: $(maschina --version)"
fi

# ── Rebuild and restart changed services ─────────────────────────────────────

SERVICES_TO_REBUILD=""

if needs_rebuild_api;      then SERVICES_TO_REBUILD="$SERVICES_TO_REBUILD api"; fi
if needs_rebuild_gateway;  then SERVICES_TO_REBUILD="$SERVICES_TO_REBUILD gateway"; fi
if needs_rebuild_realtime; then SERVICES_TO_REBUILD="$SERVICES_TO_REBUILD realtime"; fi
if needs_rebuild_daemon;   then SERVICES_TO_REBUILD="$SERVICES_TO_REBUILD daemon"; fi
if needs_rebuild_runtime;  then SERVICES_TO_REBUILD="$SERVICES_TO_REBUILD runtime"; fi
if needs_rebuild_worker;   then SERVICES_TO_REBUILD="$SERVICES_TO_REBUILD worker"; fi

if [[ -n "$SERVICES_TO_REBUILD" ]]; then
  log "rebuilding:$SERVICES_TO_REBUILD"
  # shellcheck disable=SC2086
  docker compose $COMPOSE_SERVICES up -d --build $SERVICES_TO_REBUILD
  log "services restarted"
fi

log "update complete — running $REMOTE"
# auto-update test 2026-03-17T06:29:35Z
