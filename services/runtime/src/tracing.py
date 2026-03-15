"""
LangSmith run tracing — wraps each agent execution with a LangSmith run.
No-ops silently if LANGSMITH_API_KEY is not set.
"""

import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_API_BASE = "https://api.smith.langchain.com"


def _key() -> str | None:
    return os.environ.get("LANGSMITH_API_KEY")


def _project() -> str:
    return os.environ.get("LANGSMITH_PROJECT", "maschina")


async def _post(path: str, body: dict[str, Any]) -> None:
    key = _key()
    if not key:
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"{_API_BASE}{path}",
                headers={"x-api-key": key, "Content-Type": "application/json"},
                json=body,
            )
    except Exception as exc:  # noqa: BLE001
        logger.debug("LangSmith post failed (non-critical): %s", exc)


async def _patch(path: str, body: dict[str, Any]) -> None:
    key = _key()
    if not key:
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.patch(
                f"{_API_BASE}{path}",
                headers={"x-api-key": key, "Content-Type": "application/json"},
                json=body,
            )
    except Exception as exc:  # noqa: BLE001
        logger.debug("LangSmith patch failed (non-critical): %s", exc)


async def start_trace(
    run_id: str,
    agent_id: str,
    user_id: str,
    model: str,
    input_message: str,
) -> float:
    """Create a LangSmith run. Returns the start timestamp for latency calculation."""
    start = time.time()
    await _post(
        "/runs",
        {
            "id": run_id,
            "name": f"agent:{agent_id}",
            "run_type": "llm",
            "start_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(start)),
            "inputs": {"message": input_message},
            "extra": {
                "model": model,
                "agent_id": agent_id,
                "user_id": user_id,
            },
            "session_name": _project(),
        },
    )
    return start


async def end_trace(
    run_id: str,
    output: str,
    input_tokens: int,
    output_tokens: int,
    start_time: float,
) -> None:
    """Patch the LangSmith run with results."""
    await _patch(
        f"/runs/{run_id}",
        {
            "end_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "outputs": {"output": output},
            "extra": {
                "usage": {
                    "prompt_tokens": input_tokens,
                    "completion_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                },
                "latency_ms": int((time.time() - start_time) * 1000),
            },
        },
    )


async def fail_trace(run_id: str, error: str) -> None:
    """Patch the LangSmith run as failed."""
    await _patch(
        f"/runs/{run_id}",
        {
            "end_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "error": error,
        },
    )
