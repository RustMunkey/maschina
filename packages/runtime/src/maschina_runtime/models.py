from typing import Any
from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class RunInput(BaseModel):
    """Input for a single agent run."""

    run_id: str
    message: str
    history: list[Message] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    tool_name: str
    result: str
    error: str | None = None


class RunResult(BaseModel):
    """Output of a completed agent run."""

    run_id: str
    output: str
    tool_calls: list[ToolResult] = Field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    turns: int = 1
    stopped_reason: str = "end_turn"
