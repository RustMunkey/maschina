"""NATS JetStream pull consumer — routes worker jobs to handlers."""

from __future__ import annotations

import asyncio
import json
import ssl

import nats
import nats.js
import structlog
from nats.js.api import AckPolicy, ConsumerConfig, RetentionPolicy, StreamConfig

from .config import settings
from .handlers import (
    handle_batch,
    handle_ml_inference,
    handle_report,
    handle_webhook_dispatch,
    handle_workflow_trigger,
)
from .models import (
    BatchJob,
    JobEnvelope,
    MlInferenceJob,
    ReportJob,
    WebhookDispatchJob,
    WorkflowTriggerJob,
)

log = structlog.get_logger()

STREAM_CONFIG = StreamConfig(
    name=settings.stream_name,
    subjects=["maschina.jobs.>"],
    retention=RetentionPolicy.WORK_QUEUE,
    max_age=86_400 * 1_000_000_000,  # 24h in nanoseconds
)

CONSUMER_CONFIG = ConsumerConfig(
    name=settings.consumer_name,
    durable_name=settings.consumer_name,
    filter_subject=settings.subject_filter,
    ack_policy=AckPolicy.EXPLICIT,
    max_deliver=5,
    ack_wait=30,
)


async def run_consumer() -> None:
    """Connect to NATS, set up JetStream consumer, and start pulling messages."""
    connect_opts: dict = {"servers": settings.nats_url}
    if settings.nats_ca_cert:
        ssl_ctx = ssl.create_default_context(cafile=settings.nats_ca_cert)
        connect_opts["tls"] = ssl_ctx
    nc = await nats.connect(**connect_opts)
    js = nc.jetstream()

    # Ensure stream exists (idempotent)
    try:
        await js.add_stream(STREAM_CONFIG)
    except Exception:
        pass  # stream already exists

    # Ensure consumer exists (idempotent)
    try:
        await js.add_consumer(settings.stream_name, CONSUMER_CONFIG)
    except Exception:
        pass

    psub = await js.pull_subscribe(
        settings.subject_filter,
        durable=settings.consumer_name,
        stream=settings.stream_name,
    )

    sem = asyncio.Semaphore(settings.max_concurrent)
    log.info("worker.consumer.ready", subject=settings.subject_filter)

    while True:
        try:
            msgs = await psub.fetch(batch=settings.max_concurrent, timeout=2.0)
        except Exception:
            await asyncio.sleep(0.5)
            continue

        for msg in msgs:
            asyncio.create_task(_handle(msg, sem))


async def _handle(msg: nats.aio.msg.Msg, sem: asyncio.Semaphore) -> None:
    async with sem:
        try:
            raw = json.loads(msg.data)
            envelope = JobEnvelope.model_validate(raw)
            await _dispatch(envelope)
            await msg.ack()
        except Exception as exc:
            log.error("worker.job.error", error=str(exc))
            await msg.nak()


async def _dispatch(envelope: JobEnvelope) -> None:
    subject = envelope.subject

    if subject == "maschina.jobs.worker.ml_inference":
        await handle_ml_inference(MlInferenceJob.model_validate(envelope.data))
    elif subject == "maschina.jobs.worker.report":
        await handle_report(ReportJob.model_validate(envelope.data))
    elif subject.startswith("maschina.jobs.worker.batch"):
        await handle_batch(BatchJob.model_validate(envelope.data))
    elif subject == "maschina.jobs.worker.webhook_dispatch":
        await handle_webhook_dispatch(WebhookDispatchJob.model_validate(envelope.data))
    elif subject == "maschina.jobs.worker.workflow_trigger":
        await handle_workflow_trigger(WorkflowTriggerJob.model_validate(envelope.data))
    else:
        log.warning("worker.unknown_subject", subject=subject)
