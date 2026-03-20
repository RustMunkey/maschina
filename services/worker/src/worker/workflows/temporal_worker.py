"""Starts the Temporal worker that executes AgentWorkflow activities."""

from __future__ import annotations

import asyncio

import structlog
from temporalio.client import Client
from temporalio.worker import Worker
from temporalio.worker.workflow_sandbox import SandboxedWorkflowRunner, SandboxRestrictions

from ..config import settings
from .activities import run_agent_step, update_run_status
from .agent_workflow import AgentWorkflow

log = structlog.get_logger()

TASK_QUEUE = "maschina-workflows"

_MAX_CONNECT_ATTEMPTS = 30
_CONNECT_BACKOFF = 10.0  # seconds between attempts


async def _connect_with_retry() -> Client:
    """Connect to Temporal, retrying until it's ready.

    temporalio/auto-setup takes 1-3 minutes to initialise schemas after the
    port opens. We retry for up to 5 minutes before giving up.
    """
    for attempt in range(1, _MAX_CONNECT_ATTEMPTS + 1):
        try:
            client = await Client.connect(settings.temporal_url)
            log.info(
                "workflow.temporal_worker.connected", url=settings.temporal_url, attempt=attempt
            )
            return client
        except Exception as exc:
            if attempt >= _MAX_CONNECT_ATTEMPTS:
                raise
            log.warning(
                "workflow.temporal_worker.connect_retry",
                url=settings.temporal_url,
                attempt=attempt,
                max=_MAX_CONNECT_ATTEMPTS,
                error=str(exc),
            )
            await asyncio.sleep(_CONNECT_BACKOFF)

    raise RuntimeError("unreachable")


async def run_temporal_worker() -> None:
    log.info("workflow.temporal_worker.connecting", url=settings.temporal_url)
    client = await _connect_with_retry()

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[AgentWorkflow],
        activities=[run_agent_step, update_run_status],
        workflow_runner=SandboxedWorkflowRunner(
            restrictions=SandboxRestrictions.default.with_passthrough_modules(
                "httpx", "asyncpg", "structlog", "pathlib", "pydantic", "pydantic_settings"
            )
        ),
    )

    log.info("workflow.temporal_worker.ready", task_queue=TASK_QUEUE)
    await worker.run()
