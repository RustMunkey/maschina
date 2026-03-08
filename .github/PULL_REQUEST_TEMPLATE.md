## What

<!-- What does this PR do? One paragraph or a few bullets. -->

## Why

<!-- Why is this change needed? Link to an issue if applicable. Closes #??? -->

## How

<!-- Key implementation decisions, tradeoffs, anything a reviewer should understand before reading the diff. -->

## Testing

<!-- How did you test this? What cases are covered? -->

- [ ] Unit tests added or updated
- [ ] Integration tests added or updated (if applicable)
- [ ] Tested locally against Docker stack

## Checklist

- [ ] Follows [Conventional Commits](https://www.conventionalcommits.org/) (enforced by Commitlint)
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] No `.env` files or secrets committed
- [ ] No `passwordHash`, `tokenHash`, `keyHash`, or `*Iv` columns exposed in API responses
- [ ] Breaking changes documented (if any)
