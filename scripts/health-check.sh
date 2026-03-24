#!/usr/bin/env bash
# health-check.sh — Maschina service health monitor
# Runs on Dell via cron every 5 minutes.
# Posts to Discord #health when a service goes down or recovers.
#
# Setup on Dell:
#   1. Add DISCORD_HEALTH_WEBHOOK to ~/Desktop/maschina/.env
#   2. crontab -e
#      */5 * * * * /home/ash/Desktop/maschina/scripts/health-check.sh >> /var/log/maschina-health.log 2>&1

set -euo pipefail

ENV_FILE="${ENV_FILE:-$(dirname "$0")/../.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

WEBHOOK="${DISCORD_HEALTH_WEBHOOK:-}"
STATE_DIR="${STATE_DIR:-/tmp/maschina-health}"
mkdir -p "$STATE_DIR"

# ── service definitions ───────────────────────────────────────────────────────
declare -A SERVICES
SERVICES["api"]="http://localhost:3000/health"
SERVICES["gateway"]="http://localhost:8080/health"
SERVICES["realtime"]="http://localhost:4000/health"

# ── helpers ───────────────────────────────────────────────────────────────────

checks_to_fields() {
  local json="$1"
  echo "$json" | jq -c '[to_entries[] | {
    name: .key,
    value: (if .value == "ok" then ":white_check_mark: ok" else ":x: \(.value)" end),
    inline: true
  }]'
}

post_discord() {
  local color="$1"
  local title="$2"
  local fields="$3"

  [[ -z "$WEBHOOK" ]] && return 0

  curl -sf -X POST "$WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{
      \"embeds\": [{
        \"title\": $(echo "$title" | jq -Rs .),
        \"color\": $color,
        \"fields\": $fields,
        \"timestamp\": \"$(date -u +%FT%TZ)\"
      }]
    }" || true
}

check_service() {
  local name="$1"
  local url="$2"
  local state_file="$STATE_DIR/${name}.down"

  local body
  local http_code=0
  body=$(curl -sf --max-time 5 "$url" 2>/dev/null) && http_code=200 || true

  local overall_ok=false
  local checks_json="{}"
  local status_label="unreachable"

  if [[ $http_code -eq 200 ]] && [[ -n "$body" ]]; then
    status_label=$(echo "$body" | jq -r '.status // "ok"' 2>/dev/null || echo "ok")
    checks_json=$(echo "$body" | jq -c '.checks // {}' 2>/dev/null || echo "{}")

    local failed_checks
    failed_checks=$(echo "$checks_json" | jq '[to_entries[] | select(.value != "ok")] | length' 2>/dev/null || echo "0")
    [[ "$status_label" == "ok" && "$failed_checks" -eq 0 ]] && overall_ok=true
  fi

  local fields
  if [[ "$checks_json" == "{}" ]]; then
    if $overall_ok; then
      fields='[{"name":"status","value":":white_check_mark: ok","inline":true}]'
    else
      fields="[{\"name\":\"status\",\"value\":\":x: ${status_label}\",\"inline\":true}]"
    fi
  else
    fields=$(checks_to_fields "$checks_json")
  fi

  if $overall_ok; then
    if [[ -f "$state_file" ]]; then
      rm -f "$state_file"
      echo "$(date -u +%FT%TZ) RECOVERED $name"
      post_discord 5763719 "Recovered: $name" "$fields"
    else
      echo "$(date -u +%FT%TZ) OK $name"
    fi
  else
    if [[ ! -f "$state_file" ]]; then
      touch "$state_file"
      echo "$(date -u +%FT%TZ) DOWN $name ($status_label)"
      post_discord 15548997 "Down: $name" "$fields"
    else
      echo "$(date -u +%FT%TZ) STILL DOWN $name"
    fi
  fi
}

# ── run checks ────────────────────────────────────────────────────────────────
for name in "${!SERVICES[@]}"; do
  check_service "$name" "${SERVICES[$name]}"
done
