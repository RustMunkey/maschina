# Code Standards


---

## TypeScript

### Formatting and linting

**Biome** handles all TypeScript/JavaScript/JSON formatting and linting. No ESLint, no Prettier.

```bash
pnpm lint              # lint all TS/JS files
pnpm lint:fix          # lint + auto-fix
pnpm format            # format all TS/JS/JSON files
```

Config: `biome.json` at repo root.

### Key rules

- **No `any`** — use explicit types or `unknown` with narrowing
- **Strict null checks** — TypeScript `strict: true` everywhere
- **No unused variables** — flagged by Biome
- **Explicit return types** on exported functions
- **`.js` extensions** in all ESM import paths (required for Node ESM resolution)

```typescript
// Correct
import { createUser } from "./user.js";
import type { User } from "@maschina/database";

// Wrong
import { createUser } from "./user";
import { type User } from "@maschina/database";
```

### File structure

```typescript
// 1. External imports
import { Hono } from "hono";

// 2. Internal package imports
import { db } from "@maschina/database";

// 3. Local imports
import { validate } from "./validate.js";

// 4. Types
type CreateUserInput = { ... };

// 5. Implementation
export async function createUser(input: CreateUserInput): Promise<User> { ... }
```

### Naming

| Item | Convention |
|---|---|
| Files | `camelCase.ts` |
| Variables, functions | `camelCase` |
| Types, interfaces, classes | `PascalCase` |
| Constants | `SCREAMING_SNAKE_CASE` |
| Zod schemas | `camelCase` + `Schema` suffix (e.g., `createUserSchema`) |

### Error handling

Use typed errors — don't throw strings. All Hono route handlers return structured `{ error: { code, message, status } }` on failure.

```typescript
// Route handler pattern
app.post("/agents", async (c) => {
  const result = await createAgentSchema.safeParseAsync(await c.req.json());
  if (!result.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", status: 422 } }, 422);
  }
  // ...
});
```

---

## Rust

### Formatting and linting

**rustfmt** for formatting, **Clippy** for linting.

```bash
cargo fmt                  # format all Rust code
cargo clippy               # lint
cargo clippy -- -D warnings  # treat warnings as errors (CI)
```

### Key conventions

- Use `thiserror` for error types — typed error enums, not `Box<dyn Error>`
- Use `anyhow` in binaries and application code; `thiserror` in library code
- Prefer `tokio::spawn` for background tasks, `tokio::select!` for concurrent branches
- Avoid `.unwrap()` in production paths — use `?` or explicit error handling
- Document public API items with `///` doc comments

```rust
/// Validates a JWT token and returns the claims if valid.
///
/// Returns `None` if the token is expired, malformed, or has an invalid signature.
pub fn decode_jwt(token: &str, secret: &str) -> Option<Claims> {
    // ...
}
```

### Module structure

```
src/
  main.rs          ← entry point, arg parsing, server startup
  config.rs        ← environment config struct
  state.rs         ← AppState (shared across handlers)
  error.rs         ← error types (thiserror)
  auth.rs          ← auth extraction logic
  middleware.rs    ← Axum middleware
  handlers.rs      ← route handlers
  routes.rs        ← router setup
```

---

## Python

### Formatting and linting

**Ruff** for both formatting and linting.

```bash
ruff format .       # format
ruff check .        # lint
ruff check --fix .  # lint + auto-fix
```

Config: `ruff.toml` or `[tool.ruff]` in `pyproject.toml`.

### Key rules

- Type hints required on all function signatures
- `async def` for all I/O-bound functions
- Pydantic models for all data schemas (request/response, config)
- No bare `except:` — always catch specific exceptions

```python
# Correct
async def check_input(text: str, tier: str = "access") -> RiskResult:
    ...

# Wrong
def check_input(text, tier="access"):
    ...
```

### Package structure

```
packages/risk/
  src/
    maschina_risk/
      __init__.py       ← public exports
      checks.py         ← implementation
      models.py         ← Pydantic models
      patterns.py       ← pattern constants
  tests/
    test_checks.py
  pyproject.toml
```

---

## General

### Security

- Never log secrets, tokens, or password hashes
- Never commit `.env` files
- Validate all input at service boundaries with Zod (TS) or Pydantic (Python)
- Use parameterized queries only — no string interpolation in SQL
- Hash passwords with argon2id — never store plaintext or use bcrypt/MD5
- API responses must never include `passwordHash`, `tokenHash`, `keyHash`, or `*Iv` columns

### Comments

Only comment non-obvious logic. Code should be self-documenting. Avoid:

```typescript
// Get user by ID
const user = await getUserById(id);  // this comment adds nothing
```

Prefer:

```typescript
// emailIndex is HMAC-SHA256(email.toLowerCase(), JWT_SECRET) — used for timing-safe lookup
const user = await db.query.users.findFirst({ where: eq(users.emailIndex, emailIndex) });
```

### No over-engineering

- Don't abstract for one-off uses
- Don't add error handling for impossible cases
- Don't add feature flags for changes you can just ship
- Three similar lines is fine — premature abstraction is worse
