#!/usr/bin/env python3
"""
Agent sandbox entrypoint.

Reads a RunRequest as JSON from stdin, executes it, writes RunResponse
as JSON to stdout. Designed to run inside a gVisor container spawned
by services/runtime/src/sandbox.py.

The container has:
  - no persistent filesystem (read-only rootfs + tmpfs /tmp)
  - no network by default (--network=none), or controlled egress
  - rlimit applied by the container runtime (--memory, --cpus flags)
  - this process runs as nobody (non-root)
"""

import asyncio
import json
import sys


def main() -> None:
    try:
        raw = sys.stdin.read()
        req_dict = json.loads(raw)
    except Exception as exc:
        json.dump({"error": f"failed to read request: {exc}"}, sys.stdout)
        sys.exit(1)

    # Lazy import inside container — avoids import errors at entrypoint load time
    try:
        from src.models import RunRequest
        from src.runner import execute
    except ImportError:
        # Try alternate import path when installed as package
        from maschina_runtime_service.models import RunRequest  # type: ignore[no-reattr]
        from maschina_runtime_service.runner import execute  # type: ignore[no-reattr]

    async def _run() -> None:
        req = RunRequest(**req_dict)
        response = await execute(req)
        json.dump(response.model_dump(), sys.stdout)

    try:
        asyncio.run(_run())
    except Exception as exc:
        json.dump({"error": str(exc)}, sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
