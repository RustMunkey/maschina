"""Starts the Temporal worker that executes AgentWorkflow activities."""

from __future__ import annotations

import structlog
from temporalio.client import Client
from temporalio.worker import Worker

from ..config import settings
from .activities import run_agent_step, update_run_status
from .agent_workflow import AgentWorkflow

log = structlog.get_logger()

TASK_QUEUE = "maschina-workflows"


async def run_temporal_worker() -> None:
    log.info("workflow.temporal_worker.connecting", url=settings.temporal_url)
    client = await Client.connect(settings.temporal_url)

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[AgentWorkflow],
        activities=[run_agent_step, update_run_status],
    )

    log.info("workflow.temporal_worker.ready", task_queue=TASK_QUEUE)
    await worker.run()
