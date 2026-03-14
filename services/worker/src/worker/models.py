from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel


class JobEnvelope(BaseModel):
    """Wrapper published to NATS by services/api or the daemon."""

    id: str
    subject: str
    data: dict[str, Any]


class MlInferenceJob(BaseModel):
    run_id: UUID
    agent_id: UUID
    user_id: UUID
    model: str
    prompt: str
    max_tokens: int = 2048


class ReportJob(BaseModel):
    report_id: str
    user_id: UUID
    report_type: str  # "usage_summary" | "agent_performance" | "billing"
    period_start: str  # ISO date
    period_end: str


class BatchJob(BaseModel):
    batch_id: str
    job_type: str  # "feature_extraction" | "reward_computation" | "reconcile"
    run_ids: list[str]


class WebhookDispatchJob(BaseModel):
    delivery_id: str  # uuid — matches webhook_deliveries.id
    webhook_id: str  # uuid — matches webhooks.id
    event: str  # e.g. "agent.run.completed"
    payload: dict[str, Any]  # the full typed event payload
    attempt: int = 1  # current attempt number (1-based)
