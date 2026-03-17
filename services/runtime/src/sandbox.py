"""
Per-run resource limiting.

Wraps the entire agent execution in a child process with rlimit applied so a
single runaway run cannot consume all RAM or CPU on the node. The parent
runtime process stays healthy; only the child is killed on limit breach.

Architecture:
  Parent (FastAPI worker)
    └─ Child process (one per run)
         ├─ rlimit: RLIMIT_AS  (virtual memory cap)
         ├─ rlimit: RLIMIT_CPU (CPU time cap)
         └─ runs the full execute() pipeline

Communication is via a multiprocessing Queue — the child puts a
(result_dict | None, error_str | None) tuple and exits. The parent
waits up to timeout_secs then kills the child if it hasn't finished.

This is Unix-only. On non-Unix platforms the limits are skipped and
execute() runs in-process (same behaviour as before this module existed).
"""

from __future__ import annotations

import asyncio
import logging
import multiprocessing
import platform
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import RunRequest, RunResponse

logger = logging.getLogger(__name__)

_IS_UNIX = platform.system() != "Windows"


def _child_worker(
    req_dict: dict,
    result_queue: multiprocessing.Queue[tuple[dict | None, str | None]],
    memory_limit_bytes: int,
    cpu_limit_secs: int,
) -> None:
    """Entry point for the sandboxed child process."""
    # Apply resource limits before doing anything else.
    if _IS_UNIX and (memory_limit_bytes > 0 or cpu_limit_secs > 0):
        import resource

        if memory_limit_bytes > 0:
            resource.setrlimit(resource.RLIMIT_AS, (memory_limit_bytes, memory_limit_bytes))
        if cpu_limit_secs > 0:
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_limit_secs, cpu_limit_secs))

    # Reconstruct RunRequest inside the child (avoids pickling complex objects).
    import asyncio as _asyncio

    from .models import RunRequest
    from .runner import execute

    req = RunRequest(**req_dict)

    async def _run() -> None:
        try:
            response = await execute(req)
            result_queue.put((response.model_dump(), None))
        except Exception as exc:
            result_queue.put((None, str(exc)))

    _asyncio.run(_run())


async def execute_sandboxed(req: RunRequest) -> RunResponse:
    """
    Run execute(req) in a resource-limited child process.

    Falls back to in-process execution on Windows or when sandbox is disabled.
    """
    from .config import settings
    from .models import RunResponse
    from .runner import execute

    # Skip sandboxing if disabled or on Windows
    if not _IS_UNIX or not settings.sandbox_enabled:
        return await execute(req)

    memory_limit_bytes = settings.run_memory_limit_mb * 1024 * 1024
    cpu_limit_secs = settings.run_cpu_limit_secs
    timeout = float(req.timeout_secs or settings.default_timeout_secs)

    ctx = multiprocessing.get_context("spawn")
    result_queue: multiprocessing.Queue = ctx.Queue()

    proc = ctx.Process(
        target=_child_worker,
        args=(req.model_dump(), result_queue, memory_limit_bytes, cpu_limit_secs),
        daemon=True,
    )
    proc.start()
    logger.debug(
        "sandboxed run started pid=%d run_id=%s mem_limit_mb=%d cpu_limit_secs=%d",
        proc.pid,
        req.run_id,
        settings.run_memory_limit_mb,
        cpu_limit_secs,
    )

    # Wait for result with timeout — runs in a thread so we don't block the event loop
    loop = asyncio.get_running_loop()
    try:
        result_dict, error = await asyncio.wait_for(
            loop.run_in_executor(None, result_queue.get),
            timeout=timeout + 5,  # small buffer beyond run timeout
        )
    except TimeoutError:
        proc.kill()
        proc.join(timeout=2)
        raise RuntimeError(f"run {req.run_id} exceeded timeout ({timeout}s) and was killed")
    finally:
        if proc.is_alive():
            proc.kill()
        proc.join(timeout=2)

    if error is not None:
        raise RuntimeError(error)

    if result_dict is None:
        raise RuntimeError(f"run {req.run_id} produced no result")

    return RunResponse(**result_dict)
