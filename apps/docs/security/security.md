# Security Model

---

## Platform Security Principles

1. **Defense in depth** — no single control is the only barrier; multiple independent layers
2. **Least privilege** — services and users get the minimum access required
3. **Zero trust between services** — internal services trust only headers injected by the gateway, never client-supplied values
4. **Fail closed** — on auth error, rate limit error, or quota error, deny by default
5. **No secrets in code** — all credentials via environment variables, managed by Doppler
6. **Timing-safe comparisons** — all token and API key comparisons use constant-time equality

---

## Threat Model

### Attack surfaces

| Surface | Attacker goal | Mitigation |
|---|---|---|
| Public API (`/auth/*`) | Credential stuffing, brute force | Rate limiting (IP), argon2id (slow hash), account lockout |
| JWT tokens | Token forgery, replay | HS256 signature, expiry claim, token rotation on refresh |
| API keys | Key theft, unauthorized use | Prefix-based lookup, timing-safe hash comparison, revocation |
| Agent inputs | Prompt injection, data exfiltration | `check_input` risk checks, `check_output` PII scan |
| Agent outputs | PII leakage to caller | Post-run output scan |
| WebSocket endpoint | Unauthorized connection | JWT or `x-forwarded-user-id` validation on connect |
| Admin console | Unauthorized internal access | Separate auth path, Internal plan tier required |
| CI/CD pipeline | Secret exfiltration, supply chain | Doppler-managed secrets, Dependabot, pinned Actions versions |

### Out of scope (not in threat model)

- Physical hardware attacks
- Anthropic API compromise (not under Maschina control)
- Full Fly.io or Neon infrastructure compromise

---

## Authentication Layers

### Layer 1 — Cloudflare

DDoS protection, WAF, bot management. Blocks volumetric attacks before they reach the gateway.

### Layer 2 — Gateway rate limiting

- Per-IP: 120 req/min for unauthenticated requests
- Per-user: 1,000 req/min for JWT-authenticated requests

### Layer 3 — JWT validation (gateway)

Stateless — gateway validates the JWT signature and expiry using `JWT_SECRET`. No DB call. Invalid tokens are rejected before reaching `services/api`.

### Layer 4 — Session + API key validation (api)

For API key requests: the raw key is forwarded as `x-forwarded-api-key`. `services/api` looks up the key prefix, then does a timing-safe hash comparison against the stored hash.

### Layer 5 — RBAC and plan gates

`packages/plans` enforces plan-tier gates on every route that requires capability checks. Internal plan tier bypasses all quota and billing gates.

---

## Password Security

- **Algorithm**: argon2id — memory-hard, GPU-resistant
- **Parameters**: memory = 65536 KB, iterations = 3, parallelism = 4
- **Storage**: `passwordHash` column — never returned in API responses
- **Comparison**: constant-time comparison via the `argon2` package

Plaintext passwords never leave the `services/api` process boundary. They are hashed immediately on receipt and the plaintext is not logged.

---

## Sensitive Column Policy

The following columns must **never** appear in any API response, log entry, or NATS event payload:

| Column | Table | Contains |
|---|---|---|
| `passwordHash` | `users` | Argon2id password hash |
| `tokenHash` | `sessions` | Session token hash |
| `keyHash` | `api_keys` | API key hash |
| `emailVerifyHash` | `users` | Email verification token hash |
| `passwordResetHash` | `users` | Password reset token hash |
| `*Iv` (any column) | any | AES initialization vector |
| `emailIndex` | `users` | HMAC of email (not PII, but internal-only) |

The `packages/validation` projection helpers enforce safe response shapes.

---

## Email Privacy

`users.email` is stored as plaintext today. Planned: encrypt at rest using AES-256-GCM with a per-row IV. The `emailIndex` column (HMAC-SHA256 of `email.toLowerCase()` with `JWT_SECRET`) allows lookup without decrypting.

Schema is ready; the encryption layer is planned but not yet implemented.

---

## Agent Safety

Agent runs are sandboxed:

- No filesystem access beyond the Python process
- No shell execution from the agent loop
- Network access only via the `HttpFetchTool` (safe HTTP GET, no POST)
- Input risk check blocks known prompt injection patterns
- Output risk check scans for PII before returning to daemon
- Per-run timeout enforced at the daemon level

---

## Incident Response

On suspected compromise:

1. Rotate the affected secret immediately in Doppler and sync to all services
2. If `JWT_SECRET` is compromised — rotate and restart all services, invalidate all sessions
3. If an API key is compromised — revoke via `DELETE /api-keys/:id`, log the revocation
4. Audit `usage_events` and `agent_runs` for unauthorized activity in the exposure window
5. Notify affected users if their data was accessed
