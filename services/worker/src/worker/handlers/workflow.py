"""Handle workflow_trigger NATS jobs by starting a Temporal workflow."""

from __future__ import annotations

import structlog
from temporalio.client import Client

from ..config import settings
from ..models import WorkflowTriggerJob
from ..workflows.agent_workflow import AgentWorkflow
from ..workflows.temporal_worker import TASK_QUEUE

log = structlog.get_logger()

_client: Client | None = None


async def _get_client() -> Client:
    global _client
    if _client is None:
        _client = await Client.connect(settings.temporal_url)
    return _client


async def handle_workflow_trigger(job: WorkflowTriggerJob) -> None:
    client = await _get_client()

    wf_id = f"workflow-{job.run_id}"

    await client.start_workflow(
        AgentWorkflow.run,
        args=[
            {
                "run_id": job.run_id,
                "user_id": job.user_id,
                "workflow_type": job.workflow_type,
                "steps": job.steps,
                "input": job.input,
            }
        ],
        id=wf_id,
        task_queue=TASK_QUEUE,
    )

    log.info(
        "workflow.trigger.dispatched",
        run_id=job.run_id,
        workflow_type=job.workflow_type,
        temporal_workflow_id=wf_id,
    )
