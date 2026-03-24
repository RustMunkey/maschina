# Contributing Guide


---

## Git Workflow

Maschina follows a **trunk-based development** model with short-lived feature branches.

### Branch naming

```
feat/<short-description>       ← new feature
fix/<short-description>        ← bug fix
chore/<short-description>      ← tooling, deps, config
docs/<short-description>       ← documentation only
refactor/<short-description>   ← refactor without behavior change
```

Examples:
```
feat/agent-streaming-output
fix/quota-counter-race
chore/update-drizzle
docs/nats-consumer-guide
```

### Workflow

1. Branch from `main`
2. Make changes — commit early and often
3. Push and open a pull request
4. Pass CI — all checks must be green
5. Get at least one review
6. Squash merge into `main`

Never push directly to `main`. Never force-push to `main`.

---

## Commit Conventions

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/). Enforced by Commitlint on every `git commit`.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | When to use |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Code restructure, no behavior change |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `build` | Build system or dependency changes |
| `ci` | CI configuration changes |
| `chore` | Miscellaneous maintenance |
| `revert` | Reverts a previous commit |
| `wip` | Work in progress — avoid in PRs |

### Examples

```
feat(agents): add streaming output support via SSE
fix(auth): resolve race condition in token rotation
chore(deps): upgrade drizzle-orm to 0.36
docs(nats): document JetStream consumer setup
test(risk): add PII detection edge cases
```

### Scopes

Use the package or service name: `auth`, `billing`, `gateway`, `daemon`, `runtime`, `api`, `plans`, `nats`, `jobs`, etc.

---

## Pull Request Process

### PR title

Must follow Conventional Commits — the squash merge commit is generated from the PR title.

### PR description

```markdown
## What
Brief description of the change.

## Why
Why this change is needed.

## How
Key implementation decisions and tradeoffs.

## Testing
How you tested this. What test cases were added.

## Checklist
- [ ] Tests added or updated
- [ ] CHANGELOG.md updated under [Unreleased]
- [ ] No .env files committed
- [ ] No secrets or API keys in code
```

### Review guidelines

- Read the full diff before approving
- All review comments must be resolved before merge
- Do not approve PRs that skip security checks (`--no-verify`, hardcoded secrets, bypassed auth)

---

## Pre-Commit Hooks

Husky runs these automatically on `git commit`:

**pre-commit** (lint-staged — staged files only):
- TypeScript/JavaScript/JSON: `biome check --write`
- Python: `ruff format && ruff check --fix`
- Rust: `rustfmt`

**commit-msg**:
- `commitlint --edit` — validates message format

---

## Changelog

Every PR that changes behavior must update `CHANGELOG.md` under `[Unreleased]`.

```markdown
## [Unreleased]

### Added
- Agent streaming output via SSE

### Fixed
- Quota counter race condition in concurrent runs

### Changed
- Daemon NAKs failed jobs with 10s backoff instead of immediate retry
```

Categories: `Added`, `Fixed`, `Changed`, `Removed`, `Security`.

---

## Dependency Updates

Dependabot opens automated PRs for npm, Cargo, pip, and GitHub Actions. Merge these regularly. Security updates within 24 hours. Test major version bumps before merging.
