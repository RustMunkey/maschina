FROM python:3.12-slim AS builder
WORKDIR /app

RUN pip install --no-cache-dir uv

# Install workspace packages in dependency order
COPY packages/runtime ./packages/runtime
COPY packages/agents  ./packages/agents
COPY packages/risk    ./packages/risk
COPY packages/ml      ./packages/ml

RUN uv pip install --system --no-cache \
    ./packages/runtime \
    ./packages/agents \
    ./packages/risk \
    ./packages/ml

# Install worker service deps
COPY services/worker/pyproject.toml ./services/worker/pyproject.toml
COPY services/worker/src ./services/worker/src
RUN uv pip install --system --no-cache ./services/worker

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin/maschina-worker /usr/local/bin/maschina-worker

CMD ["maschina-worker"]
