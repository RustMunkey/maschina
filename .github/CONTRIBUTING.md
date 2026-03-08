# Contributing to Maschina

Thank you for your interest in contributing. This document is a quick-start guide. Full detail lives in the engineering docs:

- **[Local development setup](../docs/development/local.md)**
- **[Environment configuration](../docs/development/environment.md)**
- **[Code standards](../docs/development/standards.md)**
- **[Testing strategy](../docs/development/testing.md)**
- **[Git workflow and commit conventions](../docs/development/contributing.md)**

---

## Quick start

```bash
git clone git@github.com:RustMunkey/maschina.git
cd maschina
pnpm install
docker compose -f docker/docker-compose.yml up -d
pnpm db:migrate
pnpm dev
```

Full setup guide: [docs/development/local.md](../docs/development/local.md)

---

## Before you open a PR

- [ ] Read [docs/development/contributing.md](../docs/development/contributing.md)
- [ ] Branch from `main` with a descriptive name (`feat/`, `fix/`, `chore/`)
- [ ] Follow [Conventional Commits](https://www.conventionalcommits.org/) — enforced by Commitlint
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test` locally and fix any failures
- [ ] Update `CHANGELOG.md` under `[Unreleased]`
- [ ] No secrets, `.env` files, or sensitive data in commits

---

## Stack

| Layer | Technology |
|---|---|
| API | TypeScript + Hono |
| Gateway / Daemon / Realtime | Rust + Axum / Tokio |
| Agent runtime | Python + FastAPI |
| Desktop | Rust + Tauri 2 |
| Android | Kotlin + Jetpack Compose |
| iOS | Swift + SwiftUI |
| Database | PostgreSQL / SQLite + Drizzle ORM |
| Messaging | NATS JetStream |

Full stack reference: [docs/TECHSTACK.md](../docs/TECHSTACK.md)

---

## Questions

Open a [GitHub Discussion](https://github.com/RustMunkey/maschina/discussions) for design questions or ideas before opening a PR for large changes. This keeps everyone aligned early and avoids wasted work.

For bugs, use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).
