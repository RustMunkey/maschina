"""ML inference handler — runs a model call outside the synchronous runtime path."""

from __future__ import annotations

import structlog

from ..models import MlInferenceJob

log = structlog.get_logger()


async def handle_ml_inference(job: MlInferenceJob) -> None:
    """
    Execute an ML inference job asynchronously.

    Used for long-running or batch inference requests that would time out
    in the synchronous services/runtime request/response flow.
    """
    log.info("ml_inference.start", run_id=str(job.run_id), model=job.model)

    try:
        import anthropic

        client = anthropic.AsyncAnthropic()

        response = await client.messages.create(
            model=job.model,
            max_tokens=job.max_tokens,
            messages=[{"role": "user", "content": job.prompt}],
        )

        output = "".join(block.text for block in response.content if hasattr(block, "text"))

        log.info(
            "ml_inference.complete",
            run_id=str(job.run_id),
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            output_len=len(output),
        )

    except Exception as exc:
        log.error("ml_inference.error", run_id=str(job.run_id), error=str(exc))
        raise
