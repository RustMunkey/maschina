#!/usr/bin/env bash
# backup.sh — PostgreSQL → S3 daily backup
#
# Setup on Dell:
#   1. Install AWS CLI: sudo apt install awscli -y
#   2. Configure: aws configure  (use your AWS access key + us-east-1 + json)
#   3. Create S3 bucket: aws s3 mb s3://maschina-backups
#   4. Add to crontab: crontab -e
#      0 3 * * * /home/ash/Desktop/maschina/scripts/backup.sh >> /var/log/maschina-backup.log 2>&1
#
# Env vars (loaded from .env or set in environment):
#   S3_BACKUP_BUCKET   — S3 bucket name (default: maschina-backups)
#   BACKUP_RETAIN_DAYS — how many days to keep backups (default: 30)
#   DISCORD_HEALTH_WEBHOOK — optional, posts result to Discord

set -euo pipefail

ENV_FILE="${ENV_FILE:-$(dirname "$0")/../.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

BUCKET="${S3_BACKUP_BUCKET:-maschina-backups}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
WEBHOOK="${DISCORD_HEALTH_WEBHOOK:-}"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_FILE="/tmp/maschina-pg-${TIMESTAMP}.sql.gz"

PG_CONTAINER="maschina-postgres"
PG_USER="${POSTGRES_USER:-maschina}"
PG_DB="${POSTGRES_DB:-maschina}"

log() { echo "$(date -u +%FT%TZ) $*"; }

# ── Dump ──────────────────────────────────────────────────────────────────────

log "Starting backup → s3://${BUCKET}/postgres/${TIMESTAMP}.sql.gz"

docker exec "$PG_CONTAINER" \
  pg_dump -U "$PG_USER" "$PG_DB" | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
log "Dump complete: ${BACKUP_SIZE}"

# ── Upload ────────────────────────────────────────────────────────────────────

aws s3 cp "$BACKUP_FILE" "s3://${BUCKET}/postgres/${TIMESTAMP}.sql.gz" \
  --storage-class STANDARD_IA

rm -f "$BACKUP_FILE"
log "Uploaded to S3"

# ── Prune old backups ─────────────────────────────────────────────────────────

CUTOFF=$(date -u -d "${RETAIN_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
  || date -u -v-"${RETAIN_DAYS}"d +%Y-%m-%dT%H:%M:%SZ)  # macOS fallback

aws s3 ls "s3://${BUCKET}/postgres/" \
  | awk '{print $4}' \
  | while read -r key; do
      FILE_DATE=$(echo "$key" | grep -oP '^\d{8}' || true)
      if [[ -n "$FILE_DATE" ]]; then
        FILE_TS="${FILE_DATE:0:4}-${FILE_DATE:4:2}-${FILE_DATE:6:2}T00:00:00Z"
        if [[ "$FILE_TS" < "$CUTOFF" ]]; then
          log "Pruning old backup: $key"
          aws s3 rm "s3://${BUCKET}/postgres/${key}"
        fi
      fi
    done

log "Backup complete"

# ── Discord notification ───────────────────────────────────────────────────────

if [[ -n "$WEBHOOK" ]]; then
  curl -sf -X POST "$WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{
      \"embeds\": [{
        \"title\": \"Backup complete\",
        \"color\": 5763719,
        \"fields\": [
          { \"name\": \"Size\", \"value\": \"${BACKUP_SIZE}\", \"inline\": true },
          { \"name\": \"Retained\", \"value\": \"${RETAIN_DAYS} days\", \"inline\": true },
          { \"name\": \"Timestamp\", \"value\": \"${TIMESTAMP}\", \"inline\": true }
        ],
        \"timestamp\": \"$(date -u +%FT%TZ)\"
      }]
    }" || true
fi
