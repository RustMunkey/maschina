from __future__ import annotations

from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AgentType(StrEnum):
    signal = "signal"
    analysis = "analysis"
    execution = "execution"
    optimization = "optimization"
    reporting = "reporting"


class AgentStatus(StrEnum):
    idle = "idle"
    scanning = "scanning"
    evaluating = "evaluating"
    executing = "executing"
    analyzing = "analyzing"
    scaling = "scaling"
    error = "error"
    archived = "archived"


class RunStatus(StrEnum):
    queued = "queued"
    executing = "executing"
    completed = "completed"
    failed = "failed"
    timeout = "timeout"
    canceled = "canceled"


class Agent(BaseModel):
    id: UUID
    name: str
    description: str | None
    agent_type: AgentType
    model: str
    system_prompt: str
    status: AgentStatus
    created_at: str
    updated_at: str


class AgentRun(BaseModel):
    id: UUID
    agent_id: UUID
    status: RunStatus
    input_payload: dict[str, Any]
    output_payload: dict[str, Any] | None
    input_tokens: int | None
    output_tokens: int | None
    duration_ms: int | None
    error_code: str | None
    error_message: str | None
    started_at: str | None
    finished_at: str | None
    created_at: str


class CreateAgentInput(BaseModel):
    name: str
    description: str | None = None
    agent_type: AgentType
    model: str = "claude-sonnet-4-6"
    system_prompt: str = ""
    config: dict[str, Any] = {}


class UpdateAgentInput(BaseModel):
    name: str | None = None
    description: str | None = None
    model: str | None = None
    system_prompt: str | None = None
    config: dict[str, Any] | None = None


class RunAgentInput(BaseModel):
    message: str
    context: dict[str, Any] = {}


class ApiKey(BaseModel):
    id: UUID
    name: str
    key_prefix: str
    created_at: str
    last_used_at: str | None
    expires_at: str | None


class CreateKeyInput(BaseModel):
    name: str
    expires_at: str | None = None


class CreateKeyResponse(ApiKey):
    key: str  # raw key — shown once only


class Subscription(BaseModel):
    id: str
    tier: str
    status: str
    current_period_end: str
    cancel_at_period_end: bool


class UsageSummary(BaseModel):
    tier: str
    period: str
    quotas: dict[str, dict[str, int | None]]
