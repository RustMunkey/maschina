# Contributing to the Maschina Python SDK

Thanks for your interest in contributing.

## Development setup

```bash
git clone https://github.com/maschina-labs/sdk-python
cd sdk-python
uv sync --dev
```

## Running tests

```bash
uv run pytest tests/ -v
```

## Linting

```bash
uv run ruff check src/ tests/
uv run ruff format src/ tests/
```

## Submitting changes

1. Fork the repository
2. Create a branch: `git checkout -b fix/your-fix` or `feat/your-feature`
3. Make your changes and add tests
4. Run `pytest` — must pass
5. Open a pull request against `main`

## Code style

- Python 3.12+
- Type annotations on all public functions
- Pydantic models for all request/response types
- Async-first (`async def` throughout)

## Reporting issues

Use [GitHub Issues](https://github.com/maschina-labs/sdk-python/issues).

## License

By contributing you agree your code is licensed under the Apache 2.0 License.
