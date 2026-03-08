from typing import Any
from pydantic import BaseModel, Field


class RunRequest(BaseModel):
    """Payload sent by services/daemon when dispatching an agent run."""

    run_id: str
    agent_id: str
    user_id: str
    plan_tier: str

    # Agent configuration embedded by the daemon after resolving from DB
    system_prompt: str
    model: str = "claude-sonnet-4-6"
    max_tokens: int = 4096

    # User-provided input
    input_payload: dict[str, Any] = Field(default_factory=dict)

    # Seconds before this run must complete (daemon-enforced timeout)
    timeout_secs: int = 300


class RunResponse(BaseModel):
    """Returned to the daemon after the run completes."""

    run_id: str
    output_payload: dict[str, Any]
    input_tokens: int
    output_tokens: int


class ErrorResponse(BaseModel):
    error: str
    message: str
