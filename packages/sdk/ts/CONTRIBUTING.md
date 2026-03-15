# Contributing to the Maschina TypeScript SDK

Thanks for your interest in contributing.

## Development setup

```bash
git clone https://github.com/maschina-labs/sdk-typescript
cd sdk-typescript
pnpm install
```

## Running tests

```bash
pnpm test
```

## Building

```bash
pnpm build
```

## Submitting changes

1. Fork the repository
2. Create a branch: `git checkout -b fix/your-fix` or `feat/your-feature`
3. Make your changes and add tests
4. Run `pnpm test` and `pnpm build` — both must pass
5. Open a pull request against `main`

## Code style

- TypeScript strict mode
- No `any` unless absolutely necessary
- All public methods must be documented

## Reporting issues

Use [GitHub Issues](https://github.com/maschina-labs/sdk-typescript/issues).

## License

By contributing you agree your code is licensed under the Apache 2.0 License.
