#!/usr/bin/env bash
# scripts/update.sh — Auto-update Maschina node from main branch.
#
# Checks for new commits every run. If changes are detected:
#   - Pulls latest code
#   - Rebuilds affected services (Docker images)
#   - Restarts services with zero manual intervention
#
# Designed to be run by a systemd timer every 5 minutes.
# Safe to run manually at any time.

set -euo pipefail

REPO_DIR="${MASCHINA_DIR:-$HOME/Desktop/maschina}"
COMPOSE_INFRA="-f docker/docker-compose.yml"
COMPOSE_SERVICES="-f docker/docker-compose.yml -f docker/docker-compose.services.yml"
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

needs_rebuild_api()     { echo "$CHANGED" | grep -qE '^(services/api|packages/)'; }
needs_rebuild_gateway() { echo "$CHANGED" | grep -qE '^services/gateway'; }
needs_rebuild_realtime(){ echo "$CHANGED" | grep -qE '^services/realtime'; }
needs_rebuild_daemon()  { echo "$CHANGED" | grep -qE '^services/daemon'; }
needs_rebuild_runtime() { echo "$CHANGED" | grep -qE '^(services/runtime|packages/runtime|packages/agents|packages/risk|packages/ml)'; }
needs_rebuild_worker()  { echo "$CHANGED" | grep -qE '^services/worker'; }
needs_migrate()         { echo "$CHANGED" | grep -qE '^packages/db/src/migrations'; }

# ── Pull ──────────────────────────────────────────────────────────────────────

log "pulling latest..."
git pull --ff-only origin main

# ── Migrate ───────────────────────────────────────────────────────────────────

if needs_migrate; then
  log "running migrations..."
  pnpm --filter @maschina/db db:migrate
  log "migrations complete"
fi

# ── Rebuild and restart changed services ─────────────────────────────────────

SERVICES_TO_restart=""

if needs_rebuild_api;     then SERVICES_TO_restart="$SERVICES_TO_restart api"; fi
if needs_rebuild_gateway; then SERVICES_TO_restart="$SERVICES_TO_restart gateway"; fi
if needs_rebuild_realtime;then SERVICES_TO_restart="$SERVICES_TO_restart realtime"; fi
if needs_rebuild_daemon;  then SERVICES_TO_restart="$SERVICES_TO_restart daemon"; fi
if needs_rebuild_runtime; then SERVICES_TO_restart="$SERVICES_TO_restart runtime"; fi
if needs_rebuild_worker;  then SERVICES_TO_restart="$SERVICES_TO_restart worker"; fi

if [[ -z "$SERVICES_TO_restart" ]]; then
  log "no service rebuilds needed (non-service files changed)"
  exit 0
fi

log "rebuilding:$SERVICES_TO_restart"

# shellcheck disable=SC2086
docker compose $COMPOSE_SERVICES up -d --build $SERVICES_TO_restart

log "update complete — running $REMOTE"
