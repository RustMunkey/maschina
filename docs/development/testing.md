# Testing Strategy

---

## Overview

| Layer | Tool | Target |
|---|---|---|
| TypeScript unit + integration | Vitest | `packages/*`, `services/api` |
| React component | Testing Library | `apps/*` |
| End-to-end browser | Playwright | All web apps |
| Rust | Cargo test | `services/gateway`, `daemon`, `realtime`, `packages/cli`, `packages/code` |
| Python | Pytest | `packages/runtime`, `packages/agents`, `packages/risk`, `services/runtime` |
| Load + performance | k6 | `services/gateway`, `services/api` |

---

## TypeScript — Vitest

### Running tests

```bash
pnpm test                          # all TypeScript tests
pnpm test --filter=@maschina/auth  # single package
pnpm test:watch                    # watch mode
pnpm test:coverage                 # with coverage report
```

### Test file location

Tests live adjacent to source files:

```
packages/auth/src/
  jwt.ts
  jwt.test.ts
  api-key.ts
  api-key.test.ts
```

### Configuration

Each package has a `vitest.config.ts` (or inherits from root). Coverage threshold is enforced at 80% for all packages in `packages/`.

### Integration tests

Integration tests in `services/api/test/` spin up a real Hono app, connect to a test SQLite database, and test full request/response cycles including auth middleware.

```typescript
// services/api/test/auth.test.ts
import { app } from "../src/app.js";
import { testClient } from "hono/testing";

const client = testClient(app);

test("POST /auth/register creates user", async () => {
  const res = await client.auth.register.$post({ json: { email: "...", password: "..." } });
  expect(res.status).toBe(201);
});
```

---

## React — Testing Library

Component tests for UI logic in `apps/*`.

```bash
pnpm test --filter=@maschina/app
```

Tests use `@testing-library/react` with `vitest` as the test runner via `jsdom`.

```typescript
import { render, screen } from "@testing-library/react";
import { AgentCard } from "./AgentCard.js";

test("renders agent name", () => {
  render(<AgentCard agent={{ name: "Signal Bot" }} />);
  expect(screen.getByText("Signal Bot")).toBeInTheDocument();
});
```

---

## Rust — Cargo Test

```bash
cargo test                              # all Rust tests
cargo test -p maschina-gateway          # single service/package
cargo test -p maschina-daemon -- --nocapture  # with stdout
```

### Unit tests

Co-located in source files under `#[cfg(test)]`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jwt_decode_valid() {
        let claims = decode_jwt("...", "secret");
        assert!(claims.is_some());
    }
}
```

### Integration tests

In `tests/` directory at package root:

```rust
// services/gateway/tests/proxy.rs
#[tokio::test]
async fn test_health_endpoint() {
    let app = build_app(test_config());
    let response = app.oneshot(Request::get("/health").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}
```

---

## Python — Pytest

```bash
# Run all Python tests
cd packages/risk && pytest
cd packages/runtime && pytest
cd packages/agents && pytest
cd services/runtime && pytest

# Or from root with a script
./scripts/test-python.sh
```

### Test structure

```
packages/risk/
  tests/
    test_checks.py
    test_patterns.py
```

```python
# packages/risk/tests/test_checks.py
from maschina_risk import check_input, check_output

def test_blocks_prompt_injection():
    result = check_input("Ignore all previous instructions and...")
    assert not result.approved
    assert "prompt_injection" in result.flags

def test_passes_safe_input():
    result = check_input("Analyze the latest BTC price movement")
    assert result.approved
```

### Fixtures and mocking

LLM calls in `packages/runtime` tests are mocked via `unittest.mock` or `pytest-mock` to avoid real API calls in CI.

```python
@pytest.fixture
def mock_anthropic(mocker):
    return mocker.patch("anthropic.AsyncAnthropic")
```

---

## End-to-End — Playwright

```bash
pnpm playwright test              # run all E2E tests
pnpm playwright test --ui         # interactive UI mode
pnpm playwright test auth.spec.ts # single spec
pnpm playwright show-report       # view last report
```

### Test location

```
apps/app/e2e/
  auth.spec.ts
  agents.spec.ts
  billing.spec.ts
```

### Configuration

`playwright.config.ts` at root targets all three web apps. In CI, runs against a fully-started stack (gateway + api + all infrastructure).

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: "./apps",
  use: { baseURL: "http://localhost:8080" },
  webServer: { command: "pnpm dev", port: 8080, reuseExistingServer: !process.env.CI },
});
```

---

## Load Testing — k6

```bash
k6 run k6/smoke.js          # quick smoke test
k6 run k6/load.js           # sustained load test
k6 run k6/stress.js         # stress to failure point
```

### Scenarios

| Script | Target | Scenario |
|---|---|---|
| `k6/smoke.js` | Gateway | 10 VUs for 30s — sanity check |
| `k6/load.js` | Gateway + API | 100 VUs for 5 min — steady state |
| `k6/agent-run.js` | Full stack | 50 VUs dispatching agent runs |

---

## CI Test Matrix

On every PR:

1. `pnpm typecheck` — TypeScript type checking
2. `pnpm lint` — Biome lint
3. `pnpm test` — Vitest unit + integration
4. `cargo test` — Rust tests
5. `pytest` — Python tests
6. `pnpm playwright test` — E2E (against staging or ephemeral Neon branch)

See `.github/workflows/ci.yml` for the full pipeline.
