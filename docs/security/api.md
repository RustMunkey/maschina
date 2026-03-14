# API Security

---

## Rate Limiting

Rate limiting is enforced at the gateway using the `governor` crate (token bucket algorithm).

### Limits

| Auth type | Limit | Scope |
|---|---|---|
| Unauthenticated | 120 req/min | Per IP address |
| JWT authenticated | 1,000 req/min | Per user ID |
| API key | 120 req/min | Per IP address (key validated downstream) |

### Behavior on limit exceeded

- Gateway returns `429 Too Many Requests`
- Response body: `{ "error": { "code": "RATE_LIMITED", "message": "Too many requests", "status": 429 } }`
- `Retry-After` header included with seconds until bucket refills

### Implementation

```rust
// services/gateway/src/state.rs
pub struct AppState {
    pub ip_limiter: Arc<RateLimiter<IpAddr, ...>>,
    pub user_limiter: Arc<RateLimiter<String, ...>>,
}

// 120 req/min per IP
let ip_limiter = RateLimiter::keyed(Quota::per_minute(NonZeroU32::new(120).unwrap()));

// 1,000 req/min per user
let user_limiter = RateLimiter::keyed(Quota::per_minute(NonZeroU32::new(1000).unwrap()));
```

---

## Auth Mechanisms

### JWT

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Claims:

```json
{
  "sub": "<user-uuid>",
  "plan": "m5",
  "iat": 1741305600,
  "exp": 1741910400
}
```

Validated at the gateway (stateless — only needs `JWT_SECRET`). Invalid or expired tokens are rejected with `401 Unauthorized` before reaching `services/api`.

### API Keys

```
Authorization: Bearer msk_live_...
X-API-Key: msk_live_...   ← alternative header
```

Prefix format:
- `msk_live_` — production key
- `msk_test_` — test/sandbox key

Lookup:
1. Extract first 20 chars → match `keyPrefix` column
2. SHA-256 hash the full key → timing-safe compare with `keyHash`

Never log raw API keys. Never return them after initial issuance.

---

## Request Validation

All incoming request bodies are validated before reaching route logic.

**TypeScript (services/api):** Zod schemas from `packages/validation`.

```typescript
import { createAgentSchema } from "@maschina/validation";

const result = await createAgentSchema.safeParseAsync(await c.req.json());
if (!result.success) {
  return c.json({ error: { code: "VALIDATION_ERROR", message: "...", status: 422, issues: result.error.issues } }, 422);
}
```

**Python (services/runtime):** Pydantic models.

```python
class RunRequest(BaseModel):
    run_id: str
    agent_id: str
    system_prompt: str
    model: str
    input: dict
    timeout_secs: int = Field(default=300, le=600)
```

Validation happens at the service boundary — never trust caller-supplied data beyond the schema.

---

## Input Sanitization

### User-facing text inputs

- Max lengths enforced by Zod schema (e.g., agent name ≤ 100 chars, system prompt ≤ 32,768 chars)
- HTML-stripped on storage where applicable (display name, description fields)
- No raw SQL interpolation — all queries use Drizzle parameterized builders

### Agent inputs

Pre-execution risk check (`packages/risk`) scans for:
- Known prompt injection patterns (blocklist)
- Oversized inputs beyond the plan's allowed context window

### Email lookup

Email addresses are normalized to `email.toLowerCase()` before any comparison or storage. Lookup uses `emailIndex` (HMAC of normalized email) — never a plain `WHERE email = ?`.

---

## CORS

CORS is enforced by the gateway. Allowed origins are configured via `CORS_ORIGIN` environment variable.

```
CORS_ORIGIN=https://app.maschina.ai,https://maschina.ai
```

In local development: `CORS_ORIGIN=http://localhost:5173`.

Preflight `OPTIONS` requests are handled by the gateway's CORS layer before reaching any route logic.

---

## HTTPS / TLS

All traffic is TLS-encrypted:

- **Client → Cloudflare**: TLS 1.3 (Cloudflare terminates)
- **Cloudflare → Fly.io gateway**: Encrypted via Cloudflare origin certificates
- **Internal (Fly 6PN)**: WireGuard-encrypted private network

No plaintext HTTP is accepted from the internet. Cloudflare redirects HTTP to HTTPS.

---

## Stripe Webhook Verification

Stripe webhooks are received at `POST /webhooks/stripe`. Every request is verified using Stripe's webhook signature:

```typescript
const event = stripe.webhooks.constructEvent(
  await c.req.text(),            // raw body (not parsed)
  c.req.header("stripe-signature"),
  process.env.STRIPE_WEBHOOK_SECRET,
);
```

Requests with invalid or missing signatures are rejected with `400 Bad Request` and logged. The raw body is read before any JSON parsing — Stripe requires the exact bytes for signature verification.

---

## Security Headers

The gateway injects standard security headers on all responses:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

`Content-Security-Policy` is set per-app by the web app layer, not the API gateway.
