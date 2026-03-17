"""
Agent execution sandboxing — three-tier fallback.

Tier 1 (strongest): gVisor container
  Docker container with --runtime=runsc (gVisor user-space kernel).
  Intercepts all syscalls, fully isolated rootfs, no network by default.
  Requires: Docker + gVisor installed on the host, SANDBOX_IMAGE set.
  Used on: production compute nodes (Linux).

Tier 2: subprocess + rlimit
  Child process with RLIMIT_AS, RLIMIT_CPU, RLIMIT_NOFILE applied.
  Clean environment (no secrets inherited), isolated tmpdir.
  Used on: dev machines, nodes without Docker/gVisor.

Tier 3 (fallback): in-process
  No isolation. Only used when sandbox is disabled or on Windows.

execute_sandboxed() selects the strongest available tier automatically.
"""

from __future__ import annotations

import asyncio
import json
import logging
import multiprocessing
import os
import platform
import shutil
import subprocess
import tempfile
from functools import lru_cache
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import RunRequest, RunResponse

logger = logging.getLogger(__name__)

_IS_UNIX = platform.system() != "Windows"
_IS_LINUX = platform.system() == "Linux"

_ALLOWED_ENV_KEYS = {
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "TMP",
    "TEMP",
    "PYTHONPATH",
    "PYTHONDONTWRITEBYTECODE",
    "VIRTUAL_ENV",
}


# ─── Tier 1: gVisor ──────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def _gvisor_available() -> bool:
    """Return True if Docker is running and the runsc (gVisor) runtime is registered."""
    if not _IS_LINUX:
        return False
    try:
        result = subprocess.run(
            ["docker", "info", "--format", "{{range $k, $v := .Runtimes}}{{$k}} {{end}}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return "runsc" in result.stdout
    except Exception:
        return False


async def _execute_gvisor(req: RunRequest) -> RunResponse:
    """Run the agent in a gVisor container. Communicates via stdin/stdout JSON."""
    from .config import settings
    from .models import RunResponse

    timeout = float(req.timeout_secs or settings.default_timeout_secs)
    memory_mb = settings.run_memory_limit_mb
    image = settings.sandbox_image

    # Agents with http_fetch get outbound network; others get none.
    network = "bridge" if "http_fetch" in req.skills else "none"

    # Pass only the API keys the runner actually needs — nothing else.
    env_args: list[str] = []
    for key in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OLLAMA_BASE_URL"):
        val = os.environ.get(key, "")
        if val:
            env_args += ["--env", f"{key}={val}"]

    cmd = [
        "docker",
        "run",
        "--rm",
        "--runtime=runsc",
        "--read-only",
        "--tmpfs",
        "/tmp:size=64m,noexec",
        f"--network={network}",
        f"--memory={memory_mb}m",
        "--memory-swap=0",  # no swap
        "--cpus=1",
        "--user=nobody",
        "--interactive",
        "--label",
        f"maschina-run-id={req.run_id}",
        *env_args,
        image,
    ]

    req_json = req.model_dump_json()

    loop = asyncio.get_running_loop()

    def _run_container() -> tuple[dict | None, str | None]:
        try:
            proc = subprocess.run(
                cmd,
                input=req_json,
                capture_output=True,
                text=True,
                timeout=timeout + 10,
            )
            if proc.returncode != 0:
                return None, f"container exited {proc.returncode}: {proc.stderr[:500]}"
            return json.loads(proc.stdout), None
        except subprocess.TimeoutExpired:
            return None, f"run {req.run_id} exceeded timeout ({timeout}s)"
        except Exception as exc:
            return None, str(exc)

    result_dict, error = await loop.run_in_executor(None, _run_container)

    if error:
        raise RuntimeError(error)
    if result_dict is None:
        raise RuntimeError(f"gVisor container returned no output for run {req.run_id}")

    # If the entrypoint itself returned an error dict, propagate it
    if "error" in result_dict and len(result_dict) == 1:
        raise RuntimeError(result_dict["error"])

    return RunResponse(**result_dict)


# ─── Tier 2: subprocess + rlimit ─────────────────────────────────────────────


def _child_worker(
    req_dict: dict,
    result_queue: multiprocessing.Queue[tuple[dict | None, str | None]],
    memory_limit_bytes: int,
    cpu_limit_secs: int,
    work_dir: str,
) -> None:
    """Entry point for the sandboxed child process."""
    os.chdir(work_dir)

    if _IS_UNIX and (memory_limit_bytes > 0 or cpu_limit_secs > 0):
        import resource

        if memory_limit_bytes > 0:
            resource.setrlimit(resource.RLIMIT_AS, (memory_limit_bytes, memory_limit_bytes))
        if cpu_limit_secs > 0:
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_limit_secs, cpu_limit_secs))
        resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))

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


async def _execute_subprocess(req: RunRequest) -> RunResponse:
    """Run the agent in a resource-limited subprocess with env isolation."""
    from .config import settings
    from .models import RunResponse

    memory_limit_bytes = settings.run_memory_limit_mb * 1024 * 1024
    cpu_limit_secs = settings.run_cpu_limit_secs
    timeout = float(req.timeout_secs or settings.default_timeout_secs)

    ctx = multiprocessing.get_context("spawn")
    result_queue: multiprocessing.Queue = ctx.Queue()
    work_dir = tempfile.mkdtemp(prefix=f"maschina-run-{req.run_id}-")

    proc = ctx.Process(
        target=_child_worker,
        args=(req.model_dump(), result_queue, memory_limit_bytes, cpu_limit_secs, work_dir),
        daemon=True,
    )
    proc.start()
    logger.debug("subprocess sandbox pid=%d run_id=%s", proc.pid, req.run_id)

    loop = asyncio.get_running_loop()
    try:
        result_dict, error = await asyncio.wait_for(
            loop.run_in_executor(None, result_queue.get),
            timeout=timeout + 5,
        )
    except TimeoutError:
        proc.kill()
        proc.join(timeout=2)
        raise RuntimeError(f"run {req.run_id} exceeded timeout ({timeout}s) and was killed")
    finally:
        if proc.is_alive():
            proc.kill()
        proc.join(timeout=2)
        shutil.rmtree(work_dir, ignore_errors=True)

    if error is not None:
        raise RuntimeError(error)
    if result_dict is None:
        raise RuntimeError(f"run {req.run_id} produced no result")

    return RunResponse(**result_dict)


# ─── Public entry point ───────────────────────────────────────────────────────


async def execute_sandboxed(req: RunRequest) -> RunResponse:
    """
    Execute an agent run in the strongest available sandbox tier.

    Tier 1 (gVisor) → Tier 2 (subprocess rlimit) → Tier 3 (in-process)
    """
    from .config import settings
    from .runner import execute

    if not settings.sandbox_enabled:
        logger.warning("sandbox disabled — running agent in-process (not recommended on nodes)")
        return await execute(req)

    if settings.sandbox_image and _gvisor_available():
        logger.info("sandbox=gvisor run_id=%s image=%s", req.run_id, settings.sandbox_image)
        return await _execute_gvisor(req)

    if _IS_UNIX:
        logger.info("sandbox=subprocess run_id=%s", req.run_id)
        return await _execute_subprocess(req)

    logger.warning("sandbox=none (non-Unix host) run_id=%s", req.run_id)
    return await execute(req)
