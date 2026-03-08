"""Agent base class and AgentType definitions."""

from abc import ABC, abstractmethod
from enum import StrEnum
from typing import Any

from maschina_runtime import AgentRunner, RunInput, RunResult, Tool


class AgentType(StrEnum):
    """The five built-in Maschina agent categories."""

    SIGNAL = "signal"
    ANALYSIS = "analysis"
    EXECUTION = "execution"
    OPTIMIZATION = "optimization"
    REPORTING = "reporting"


class Agent(ABC):
    """
    Base class for all Maschina agents.

    Subclasses define `agent_type`, `system_prompt`, and optionally override
    `tools()` to provide function-calling capabilities.

    The `run()` method is the entry point called by services/runtime.
    """

    agent_type: AgentType
    default_model: str = "claude-sonnet-4-6"
    default_max_tokens: int = 4096

    @property
    @abstractmethod
    def system_prompt(self) -> str: ...

    def tools(self) -> list[Tool]:
        return []

    async def run(
        self,
        run_input: RunInput,
        *,
        model: str | None = None,
        max_tokens: int | None = None,
        timeout_secs: int = 300,
        anthropic_client: Any = None,
    ) -> RunResult:
        import anthropic as _anthropic

        client = anthropic_client or _anthropic.AsyncAnthropic()
        runner = AgentRunner(
            client=client,
            system_prompt=self.system_prompt,
            model=model or self.default_model,
            max_tokens=max_tokens or self.default_max_tokens,
            tools=self.tools(),
            timeout_secs=timeout_secs,
        )
        return await runner.run(run_input)

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_type": self.agent_type,
            "system_prompt": self.system_prompt,
            "model": self.default_model,
            "max_tokens": self.default_max_tokens,
            "tools": [t.name for t in self.tools()],
        }
