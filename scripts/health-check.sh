#!/usr/bin/env bash
# health-check.sh — Maschina service health monitor
# Runs on Dell via cron every 5 minutes.
# Posts to Discord #health when a service goes down or recovers.
#
# Setup on Dell:
#   1. Add DISCORD_HEALTH_WEBHOOK to /home/ash/maschina/.env
#   2. chmod +x scripts/health-check.sh
#   3. crontab -e
#      */5 * * * * /home/ash/maschina/scripts/health-check.sh >> /var/log/maschina-health.log 2>&1
#
# State files in /tmp track whether each service was previously down
# so we only post on state transitions (down → up, up → down).

set -euo pipefail

# Load env
ENV_FILE="${ENV_FILE:-$(dirname "$0")/../.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

WEBHOOK="${DISCORD_HEALTH_WEBHOOK:-}"
if [[ -z "$WEBHOOK" ]]; then
  echo "$(date -u +%FT%TZ) DISCORD_HEALTH_WEBHOOK not set — skipping"
  exit 0
fi

STATE_DIR="${STATE_DIR:-/tmp/maschina-health}"
mkdir -p "$STATE_DIR"

# ── service definitions ───────────────────────────────────────────────────────
declare -A SERVICES
SERVICES["api"]="http://localhost:3000/health"
SERVICES["gateway"]="http://localhost:8080/health"
SERVICES["realtime"]="http://localhost:4000/health"

# ── helpers ───────────────────────────────────────────────────────────────────

post_discord() {
  local color="$1"
  local title="$2"
  local description="$3"

  curl -sf -X POST "$WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{
      \"embeds\": [{
        \"title\": $(echo "$title" | jq -Rs .),
        \"description\": $(echo "$description" | jq -Rs .),
        \"color\": $color
      }]
    }" || true
}

check_service() {
  local name="$1"
  local url="$2"
  local state_file="$STATE_DIR/${name}.down"

  if curl -sf --max-time 5 "$url" >/dev/null 2>&1; then
    # Service is up
    if [[ -f "$state_file" ]]; then
      # Was down — now recovered
      rm -f "$state_file"
      echo "$(date -u +%FT%TZ) RECOVERED $name"
      post_discord 5763719 \
        "Service recovered: $name" \
        "\`$name\` is back online."
    else
      echo "$(date -u +%FT%TZ) OK $name"
    fi
  else
    # Service is down
    if [[ ! -f "$state_file" ]]; then
      # Was up — now down
      touch "$state_file"
      echo "$(date -u +%FT%TZ) DOWN $name"
      post_discord 15548997 \
        "Service down: $name" \
        "\`$name\` is not responding at \`$url\`."
    else
      echo "$(date -u +%FT%TZ) STILL DOWN $name"
    fi
  fi
}

# ── run checks ────────────────────────────────────────────────────────────────

for name in "${!SERVICES[@]}"; do
  check_service "$name" "${SERVICES[$name]}"
done
