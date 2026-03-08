# Disaster Recovery

---

## Recovery Objectives

| Objective | Target |
|---|---|
| RTO (Recovery Time Objective) | < 30 minutes for full service restoration |
| RPO (Recovery Point Objective) | < 5 minutes data loss (Neon continuous WAL) |

---

## Database Backups

### Neon (production PostgreSQL)

Neon provides continuous WAL archiving with point-in-time recovery (PITR):

- **Continuous WAL streaming** — changes captured in real time
- **PITR window** — 7-day recovery window on paid plans
- **Instant branching** — create a branch from any point in time in seconds

**Restore procedure:**

```bash
# Create a branch from a specific point in time (Neon console or CLI)
neon branches create --name recovery-2026-03-07 --parent main@2026-03-07T10:00:00Z

# Or via Neon API
curl -X POST https://console.neon.tech/api/v2/projects/{project_id}/branches \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -d '{ "branch": { "parent_timestamp": "2026-03-07T10:00:00Z" } }'
```

### SQLite (local development only)

SQLite databases are ephemeral local dev state — no backup needed.

---

## Redis Backup

Redis holds ephemeral quota counters and session state. Data loss is acceptable — quotas self-heal from PostgreSQL reconciliation, and sessions require re-login.

**AOF persistence** enabled in production Redis for < 1 second RPO on Redis data.

If Redis is completely lost:
1. Users are logged out (sessions lost) — re-login required
2. Quota counters reset to 0 — reconcile job syncs from `usage_events` table
3. Rate limit state reset — acceptable brief window of unthrottled requests

---

## NATS Recovery

NATS JetStream persists stream data to disk. In production:

- **Replication factor: 2** (Phase 2+) — stream data survives a single node failure
- **File-based storage** — backed up via volume snapshots

If a NATS node is lost in a replicated cluster, the remaining nodes elect a new leader and continue processing. No manual intervention required.

If the entire NATS cluster is lost:
1. Services reconnect automatically on NATS restart (reconnect logic built into `packages/nats`)
2. In-flight jobs that were not ACKed are redelivered when the consumer reconnects
3. Events that were not delivered to realtime are lost (acceptable — realtime is best-effort)

---

## Service Failover

### Fly.io automatic restart

All services on Fly.io have health checks configured. Fly restarts unhealthy instances automatically:

```toml
# fly.toml
[[services.tcp_checks]]
  interval = "15s"
  timeout = "2s"
  grace_period = "5s"
```

### Manual failover

If a service is unreachable:

```bash
# Restart a service
fly apps restart maschina-api

# Check instance status
fly status -a maschina-api

# SSH into instance for diagnostics
fly ssh console -a maschina-api

# View recent logs
fly logs -a maschina-api --since 30m
```

---

## Restore Procedures

### Scenario 1: Database corruption

1. Identify the last known-good timestamp (check Grafana logs or Sentry for when errors began)
2. Create a Neon PITR branch at that timestamp
3. Update `DATABASE_URL` in Fly.io secrets to point to the recovery branch
4. Deploy services with the updated secret
5. Validate data integrity
6. Promote the recovery branch to main in Neon console

### Scenario 2: Full service outage (Fly.io region down)

1. Provision services in an alternative Fly.io region
2. Update DNS (Cloudflare) to point to the new region
3. Fly.io volumes are regional — if data volumes are lost, restore from backup

### Scenario 3: Accidental data deletion

1. Stop writes to the affected tables (scale down API if needed)
2. Create a Neon PITR branch at 5 minutes before the deletion
3. Extract the deleted rows from the branch
4. Apply selective INSERT to the production branch
5. Resume normal operation

### Scenario 4: Secret compromise

1. Rotate the compromised secret immediately in Doppler
2. Sync rotated secrets to all services: `fly secrets set <KEY>=<new_value> -a <app>`
3. Restart all services to pick up new secrets
4. Invalidate all active sessions (if `JWT_SECRET` rotated): flush session store
5. Audit logs for any unauthorized access during the exposure window

---

## S3 and Object Storage

Agent artifacts and file uploads are stored in S3 with:

- **Versioning enabled** — deleted objects recoverable for 90 days
- **Lifecycle policy** — move to Glacier after 90 days, delete after 365 days
- **Cross-region replication** — enabled in Phase 3 for DR

Restore a deleted S3 object:

```bash
aws s3api list-object-versions --bucket maschina-artifacts --prefix path/to/object
aws s3api get-object --bucket maschina-artifacts --key path/to/object --version-id <version-id> ./restored-file
```

---

## Runbook Checklist

**On any P0 incident:**

- [ ] Identify affected services from Grafana + Sentry
- [ ] Check Fly.io status and logs: `fly logs -a <app>`
- [ ] Check NATS consumer lag: NATS monitoring UI at `:8222`
- [ ] Check Neon database status: Neon console
- [ ] Isolate blast radius — can the gateway serve cached responses?
- [ ] Page on-call engineer if not already aware
- [ ] Begin remediation using scenarios above
- [ ] Post incident summary to internal channel within 24 hours
