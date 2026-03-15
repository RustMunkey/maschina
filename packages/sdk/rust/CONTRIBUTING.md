# Contributing to the Maschina Rust SDK

Thanks for your interest in contributing.

## Development setup

```bash
git clone https://github.com/maschina-labs/sdk-rust
cd sdk-rust
cargo build
```

## Running tests

```bash
cargo test
```

## Linting

```bash
cargo fmt --check
cargo clippy -- -D warnings
```

## Submitting changes

1. Fork the repository
2. Create a branch: `git checkout -b fix/your-fix` or `feat/your-feature`
3. Make your changes and add tests
4. Run `cargo test` and `cargo clippy` — both must pass
5. Open a pull request against `main`

## Code style

- Stable Rust only (no nightly features)
- All public items must be documented (`///`)
- `Result<T, MaschinaError>` for all fallible operations

## Reporting issues

Use [GitHub Issues](https://github.com/maschina-labs/sdk-rust/issues).

## License

By contributing you agree your code is licensed under the Apache 2.0 License.
