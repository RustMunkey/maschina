#!/usr/bin/env bash
# dev.sh — start the full Maschina backend stack for local development.
#
# Usage:
#   ./dev.sh          start everything
#   ./dev.sh stop     stop all background services
#   ./dev.sh status   show what's running
#   ./dev.sh logs     tail all service logs

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
DIM="\033[2m"
RESET="\033[0m"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/.maschina/logs"
PID_DIR="$ROOT/.maschina/pids"
ENV_FILE="$ROOT/.env.local"

ok()   { printf "  ${GREEN}✓${RESET}  %s\n" "$1"; }
info() { printf "  ${CYAN}·${RESET}  %s\n" "$1"; }
warn() { printf "  ${YELLOW}!${RESET}  %s\n" "$1"; }
die()  { printf "  ${RED}✗${RESET}  %s\n" "$1" >&2; exit 1; }
hr()   { printf "  ${DIM}────────────────────────────────────────────${RESET}\n"; }

# ─── Commands ────────────────────────────────────────────────────────────────

CMD="${1:-start}"

case "$CMD" in
  stop)
    info "stopping all services..."
    for pid_file in "$PID_DIR"/*.pid; do
      [ -f "$pid_file" ] || continue
      name="$(basename "$pid_file" .pid)"
      pid="$(cat "$pid_file")"
      if kill -0 "$pid" 2>/dev/null; then
        kill -TERM "$pid" 2>/dev/null && ok "stopped $name (pid $pid)"
      fi
      rm -f "$pid_file"
    done
    exit 0
    ;;

  status)
    printf "\n${BOLD}  Service status${RESET}\n\n"
    check() {
      local name="$1" url="$2"
      if curl -sf "$url" >/dev/null 2>&1; then
        printf "  ${GREEN}●${RESET}  %-12s ${DIM}%s${RESET}\n" "$name" "$url"
      else
        printf "  ${DIM}○${RESET}  %-12s ${DIM}%s${RESET}\n" "$name" "$url"
      fi
    }
    check "api"       "http://localhost:3000/health"
    check "gateway"   "http://localhost:8080/health"
    check "realtime"  "http://localhost:4000/health"
    check "runtime"   "http://localhost:8001/health"
    check "nats"      "http://localhost:8222/healthz"
    check "meili"     "http://localhost:7700/health"
    check "qdrant"    "http://localhost:6333/readyz"
    printf "\n"
    exit 0
    ;;

  logs)
    if command -v tail >/dev/null 2>&1; then
      exec tail -f "$LOG_DIR"/*.log
    fi
    exit 0
    ;;

  start) ;;
  *) die "unknown command: $CMD. Usage: ./dev.sh [start|stop|status|logs]" ;;
esac

# ─── Start ───────────────────────────────────────────────────────────────────

printf "\n"
printf "  ${BOLD}Maschina${RESET} ${DIM}— local dev stack${RESET}\n"
printf "\n"
hr
printf "\n"

mkdir -p "$LOG_DIR" "$PID_DIR"

# ─── Load env ────────────────────────────────────────────────────────────────

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ROOT/.env.local.example" ]; then
    cp "$ROOT/.env.local.example" "$ENV_FILE"
    warn ".env.local created from example — edit it and set JWT_SECRET"
    printf "\n  ${BOLD}Edit .env.local, then re-run ./dev.sh${RESET}\n\n"
    exit 1
  else
    die ".env.local not found — copy .env.local.example and fill in values"
  fi
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

if [ "${JWT_SECRET:-change-me-to-a-random-string-of-at-least-32-characters}" = "change-me-to-a-random-string-of-at-least-32-characters" ]; then
  die "JWT_SECRET is not set in .env.local — run: openssl rand -base64 32"
fi

ok "env loaded from .env.local"

# ─── Check deps ──────────────────────────────────────────────────────────────

for dep in docker pnpm cargo python3; do
  command -v "$dep" >/dev/null 2>&1 || die "missing dependency: $dep"
done
ok "dependencies present"

# ─── Infrastructure ──────────────────────────────────────────────────────────

info "starting infrastructure..."
docker compose -f "$ROOT/docker/docker-compose.yml" up -d postgres redis nats >/dev/null 2>&1
ok "postgres · redis · nats running"

# Wait for postgres
for i in $(seq 1 20); do
  docker exec maschina-postgres pg_isready -U maschina >/dev/null 2>&1 && break
  [ "$i" -eq 20 ] && die "postgres failed to become ready"
  sleep 1
done

# ─── Migrations ──────────────────────────────────────────────────────────────

info "running migrations..."
(cd "$ROOT/packages/db" && pnpm db:migrate >/dev/null 2>&1)
ok "migrations applied"

# ─── Write per-service .env files ────────────────────────────────────────────

write_env() {
  local path="$1"
  shift
  printf '%s\n' "$@" > "$path"
}

write_env "$ROOT/services/api/.env" \
  "DATABASE_URL=$DATABASE_URL" \
  "REDIS_URL=$REDIS_URL" \
  "NATS_URL=$NATS_URL" \
  "JWT_SECRET=$JWT_SECRET" \
  "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}" \
  "OPENAI_API_KEY=${OPENAI_API_KEY:-}" \
  "STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}" \
  "STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}" \
  "MEILISEARCH_URL=${MEILISEARCH_URL:-http://localhost:7700}" \
  "MEILISEARCH_MASTER_KEY=${MEILISEARCH_MASTER_KEY:-masterkey-change-in-production}" \
  "QDRANT_URL=${QDRANT_URL:-http://localhost:6333}" \
  "TEMPORAL_ADDRESS=${TEMPORAL_ADDRESS:-localhost:7233}" \
  "PORT=3000" \
  "NODE_ENV=development" \
  "LOG_LEVEL=${LOG_LEVEL:-debug}" \
  "OTEL_ENABLED=false"

write_env "$ROOT/services/gateway/.env" \
  "API_URL=http://localhost:3000" \
  "REALTIME_URL=http://localhost:4000" \
  "JWT_SECRET=$JWT_SECRET" \
  "NATS_URL=$NATS_URL" \
  "GATEWAY_PORT=8080" \
  "NODE_ENV=development" \
  "RUST_LOG=${RUST_LOG:-info}"

write_env "$ROOT/services/realtime/.env" \
  "NATS_URL=$NATS_URL" \
  "REDIS_URL=$REDIS_URL" \
  "JWT_SECRET=$JWT_SECRET" \
  "REALTIME_PORT=4000" \
  "NODE_ENV=development" \
  "RUST_LOG=${RUST_LOG:-info}"

write_env "$ROOT/services/daemon/.env" \
  "DATABASE_URL=$DATABASE_URL" \
  "REDIS_URL=$REDIS_URL" \
  "NATS_URL=$NATS_URL" \
  "RUNTIME_URL=http://localhost:8001" \
  "REALTIME_URL=http://localhost:4000" \
  "NODE_ENV=development" \
  "RUST_LOG=${RUST_LOG:-info}"

write_env "$ROOT/services/runtime/.env" \
  "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}" \
  "OPENAI_API_KEY=${OPENAI_API_KEY:-}" \
  "RUNTIME_PORT=8001" \
  "NODE_ENV=development"

ok "service .env files written"

# ─── Start background services ────────────────────────────────────────────────

start_svc() {
  local name="$1"
  local log="$LOG_DIR/${name}.log"
  local pid_file="$PID_DIR/${name}.pid"
  shift

  # Kill stale process if pid file exists
  if [ -f "$pid_file" ]; then
    old_pid="$(cat "$pid_file")"
    kill -0 "$old_pid" 2>/dev/null && kill -TERM "$old_pid" 2>/dev/null
    rm -f "$pid_file"
    sleep 1
  fi

  "$@" >> "$log" 2>&1 &
  echo $! > "$pid_file"
  info "started $name  ${DIM}(pid $!, log: .maschina/logs/${name}.log)${RESET}"
}

start_svc api    pnpm --filter ./services/api dev
start_svc gateway  cargo run -p maschina-gateway --manifest-path "$ROOT/Cargo.toml"
start_svc realtime cargo run -p maschina-realtime --manifest-path "$ROOT/Cargo.toml"
start_svc daemon   cargo run -p maschina-daemon --manifest-path "$ROOT/Cargo.toml"
start_svc runtime  python3 -m uvicorn src.main:app --host 0.0.0.0 --port 8001 --app-dir "$ROOT/services/runtime"

printf "\n"
hr
printf "\n"
ok "all services starting"
printf "\n"
printf "  ${DIM}API:      http://localhost:3000${RESET}\n"
printf "  ${DIM}Gateway:  http://localhost:8080${RESET}\n"
printf "  ${DIM}Realtime: http://localhost:4000${RESET}\n"
printf "  ${DIM}Runtime:  http://localhost:8001${RESET}\n"
printf "\n"
printf "  ${DIM}./dev.sh status   — check health${RESET}\n"
printf "  ${DIM}./dev.sh logs     — tail all logs${RESET}\n"
printf "  ${DIM}./dev.sh stop     — stop everything${RESET}\n"
printf "\n"
printf "  ${YELLOW}!${RESET}  Services take 10-30s to come up (Rust compile on first run)\n"
printf "  ${YELLOW}!${RESET}  Run ${BOLD}./dev.sh status${RESET} to confirm they're healthy\n"
printf "\n"
