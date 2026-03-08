"""Report generation handler — builds usage/performance/billing reports."""

from __future__ import annotations

import structlog

from ..models import ReportJob

log = structlog.get_logger()

SUPPORTED_TYPES = {"usage_summary", "agent_performance", "billing"}


async def handle_report(job: ReportJob) -> None:
    """
    Generate a report for a user and store the result.

    Report types:
    - usage_summary: token usage, run counts, quota consumption by period
    - agent_performance: success rate, latency p50/p95, cost per run
    - billing: invoice line items, credit usage, subscription events
    """
    if job.report_type not in SUPPORTED_TYPES:
        log.warning("report.unknown_type", report_type=job.report_type, report_id=job.report_id)
        return

    log.info(
        "report.start",
        report_id=job.report_id,
        report_type=job.report_type,
        user_id=str(job.user_id),
        period=f"{job.period_start}/{job.period_end}",
    )

    try:
        if job.report_type == "usage_summary":
            await _build_usage_summary(job)
        elif job.report_type == "agent_performance":
            await _build_agent_performance(job)
        elif job.report_type == "billing":
            await _build_billing_report(job)

        log.info("report.complete", report_id=job.report_id)

    except Exception as exc:
        log.error("report.error", report_id=job.report_id, error=str(exc))
        raise


async def _build_usage_summary(job: ReportJob) -> None:
    # TODO: query usage_events, usage_rollups; aggregate by metric; write to files table
    log.info("report.usage_summary.building", report_id=job.report_id)


async def _build_agent_performance(job: ReportJob) -> None:
    # TODO: query agent_runs; compute metrics via maschina_ml.eval; write to files table
    log.info("report.agent_performance.building", report_id=job.report_id)


async def _build_billing_report(job: ReportJob) -> None:
    # TODO: query billing_events, credit_transactions; aggregate; write to files table
    log.info("report.billing.building", report_id=job.report_id)
