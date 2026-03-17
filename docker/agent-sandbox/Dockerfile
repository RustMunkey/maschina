# Agent sandbox image — runs inside gVisor (runsc) per agent task.
#
# Built from the same base as the runtime service so all maschina packages
# are available. The entrypoint reads a RunRequest from stdin and writes
# a RunResponse to stdout, then exits.
#
# Security properties (enforced by the runtime when spawning this container):
#   --runtime=runsc          gVisor user-space kernel — syscall interception
#   --read-only              immutable rootfs
#   --tmpfs /tmp:size=64m    only writable location
#   --network=none           no outbound network (overridden for http_fetch skill)
#   --user=nobody            non-root execution
#   --memory / --cpus        hard resource caps

FROM python:3.12-slim AS builder
WORKDIR /app

RUN pip install --no-cache-dir uv

COPY packages/runtime ./packages/runtime
COPY packages/agents  ./packages/agents
COPY packages/risk    ./packages/risk
COPY packages/ml      ./packages/ml

RUN uv pip install --system --no-cache \
    ./packages/runtime \
    ./packages/agents \
    ./packages/risk \
    ./packages/ml

COPY services/runtime/pyproject.toml ./services/runtime/pyproject.toml
RUN uv pip install --system --no-cache -e ./services/runtime

COPY services/runtime/src ./services/runtime/src

# ─── Sandbox image ────────────────────────────────────────────────────────────
FROM python:3.12-slim

# Create a non-root user for execution
RUN useradd --no-create-home --shell /bin/false nobody-agent 2>/dev/null || true

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin/python3 /usr/local/bin/python3
COPY --from=builder /app/services/runtime/src ./src
COPY docker/agent-sandbox/entrypoint.py ./entrypoint.py

# Read-only by default — only /tmp is writable (mounted as tmpfs by runtime)
RUN chmod +x entrypoint.py

USER nobody
ENTRYPOINT ["python3", "/app/entrypoint.py"]
