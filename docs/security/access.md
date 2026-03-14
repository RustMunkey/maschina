# Access Control

---

## Authentication Layers

Every request goes through multiple auth layers before reaching business logic.

```
Request
  │
  ▼
Cloudflare       ← WAF, DDoS, bot detection
  │
  ▼
services/gateway
  │  ← Rate limiting (IP or user)
  │  ← JWT validation (stateless)
  │  ← API key detection
  │  ← Header injection (x-forwarded-user-id, x-forwarded-plan-tier)
  ▼
services/api
  │  ← Auth middleware (read injected headers)
  │  ← RBAC / plan gate checks
  ▼
Route handler
```

---

## Auth Methods

### JWT (session)

Issued on login. Contains `sub` (user ID), `plan` (tier), `iat`, `exp`.

- Algorithm: HS256
- Default TTL: 7 days
- Stored in: `Authorization: Bearer <token>` header
- Validated by: gateway (stateless, signature + expiry only)
- Source of truth: `sessions` table in PostgreSQL

On refresh: a new token is issued and the old session row is replaced. Token rotation on every refresh prevents long-lived token reuse.

### API keys

Issued via `POST /api-keys`. Format: `msk_live_<random>` or `msk_test_<random>`.

- Prefix (`msk_live_` / `msk_test_`) stored in `keyPrefix` column for environment detection
- First 20 chars of the raw key stored in `keyPrefix` for lookup
- Full key hashed with SHA-256, stored in `keyHash` — never stored plaintext
- Comparison: timing-safe using the `crypto.timingSafeEqual` or equivalent

API key auth flow:
1. Gateway detects `Authorization: Bearer msk_*` or `X-API-Key: msk_*` header
2. Gateway forwards raw key as `x-forwarded-api-key` to `services/api`
3. `services/api` extracts prefix (first 20 chars), looks up candidate rows
4. Timing-safe hash comparison against stored `keyHash`
5. On match: auth context set, request proceeds

### OAuth (planned)

OAuth providers (GitHub, Google) will be added via the `packages/auth` OAuth handler. Tokens are exchanged server-side; no client-side OAuth flow.

---

## RBAC and Plan Gates

Authorization is enforced by `packages/plans` using the `can()` helper.

```typescript
import { can } from "@maschina/plans";

const gates = can(user.planTier);

if (!gates.runAgents()) {
  return c.json({ error: { code: "FORBIDDEN", message: "Plan does not allow agent runs" } }, 403);
}

if (!gates.accessModel("claude-opus-4-6")) {
  return c.json({ error: { code: "FORBIDDEN", message: "Opus model requires M5 or higher" } }, 403);
}
```

### Plan capability matrix

| Capability | Access | M1 | M5 | M10 | Team | Enterprise | Internal |
|---|---|---|---|---|---|---|---|
| Run agents | Local Ollama only | Cloud | Cloud | Cloud | Cloud | Cloud | All |
| Claude Haiku | No | Yes | Yes | Yes | Yes | Yes | Yes |
| Claude Sonnet | No | Yes | Yes | Yes | Yes | Yes | Yes |
| Claude Opus | No | No | Yes | Yes | Yes | Yes | Yes |
| Monthly token limit | 50k | 500k | 2M | 5M | 2M/seat | Custom | Unlimited |
| API key issuance | No | Yes | Yes | Yes | Yes | Yes | Yes |
| Billing bypass | No | No | No | No | No | No | Yes |
| All limits bypass | No | No | No | No | No | No | Yes |

### Internal tier

The `Internal` plan is reserved for the Maschina team. It bypasses all quota checks, billing gates, and model restrictions. Assigned manually — never via the Stripe billing flow.

```typescript
gates.skipBilling()   // → true for Internal only
gates.skipQuota()     // → true for Internal only
```

---

## Service Permissions

Services communicate over Fly.io's private 6PN network. Authorization between services is implicit — services are only reachable internally, not from the public internet (except the gateway).

| Service | Who can call it | How authorized |
|---|---|---|
| `services/api` | gateway only (via proxy) | 6PN network isolation |
| `services/realtime` | gateway (WS bridge) | 6PN network isolation |
| `services/runtime` | daemon only | 6PN network isolation |
| `services/daemon` | NATS (pull consumer) | NATS auth credentials |
| NATS | All services | NATS username/password per service |
| PostgreSQL | api, daemon | Connection string credential |
| Redis | api, daemon | Connection string credential |

No service accepts requests from the public internet except the gateway.

---

## Admin Console Access

`apps/console` (internal admin console) is accessible only to users with the `Internal` plan tier. It runs on a separate subdomain (`console.maschina.ai`) and requires:

1. Valid JWT with `plan: "internal"` claim
2. Additional admin password (second factor, implemented in console app)

The console is not accessible to regular users regardless of plan tier.
