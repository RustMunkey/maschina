FROM python:3.12-slim AS builder
WORKDIR /app

RUN pip install --no-cache-dir uv

# Install workspace packages in dependency order
COPY packages/runtime ./packages/runtime
COPY packages/agents  ./packages/agents
COPY packages/risk    ./packages/risk

RUN uv pip install --system --no-cache \
    ./packages/runtime \
    ./packages/agents \
    ./packages/risk

# Install runtime service deps
COPY services/runtime/pyproject.toml ./services/runtime/pyproject.toml
RUN uv pip install --system --no-cache -e ./services/runtime

COPY services/runtime/src ./services/runtime/src

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY --from=builder /app/services/runtime/src ./src

EXPOSE 8001
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
