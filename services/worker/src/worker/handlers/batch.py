"""Batch processing handler — feature extraction, reward computation, reconciliation."""

from __future__ import annotations

import structlog

from ..models import BatchJob

log = structlog.get_logger()

SUPPORTED_TYPES = {"feature_extraction", "reward_computation", "reconcile"}


async def handle_batch(job: BatchJob) -> None:
    """
    Process a batch of run IDs for offline ML/analytics work.

    Job types:
    - feature_extraction: compute and cache RunFeatures for a set of runs
    - reward_computation: compute and store RL reward signals
    - reconcile: cross-check usage_events against agent_runs for billing accuracy
    """
    if job.job_type not in SUPPORTED_TYPES:
        log.warning("batch.unknown_type", job_type=job.job_type, batch_id=job.batch_id)
        return

    log.info(
        "batch.start",
        batch_id=job.batch_id,
        job_type=job.job_type,
        n_runs=len(job.run_ids),
    )

    try:
        if job.job_type == "feature_extraction":
            await _extract_features(job)
        elif job.job_type == "reward_computation":
            await _compute_rewards(job)
        elif job.job_type == "reconcile":
            await _reconcile(job)

        log.info("batch.complete", batch_id=job.batch_id)

    except Exception as exc:
        log.error("batch.error", batch_id=job.batch_id, error=str(exc))
        raise


async def _extract_features(job: BatchJob) -> None:
    # TODO: load runs from DB, call maschina_ml.batch_extract, store results
    log.info("batch.feature_extraction", n=len(job.run_ids))


async def _compute_rewards(job: BatchJob) -> None:
    # TODO: load runs from DB, call maschina_ml.batch_rewards, store signals
    log.info("batch.reward_computation", n=len(job.run_ids))


async def _reconcile(job: BatchJob) -> None:
    # TODO: cross-check usage_events against agent_runs; flag discrepancies
    log.info("batch.reconcile", n=len(job.run_ids))
