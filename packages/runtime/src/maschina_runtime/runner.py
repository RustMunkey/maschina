"""Core agent execution engine with tool-calling and multi-turn support."""

import asyncio
import logging
from typing import Any

import anthropic

from .models import Message, RunInput, RunResult, ToolResult
from .tools import Tool

logger = logging.getLogger(__name__)

# Maximum agentic loop iterations before forcing a stop
MAX_TURNS = 20


class AgentRunner:
    """Executes an agent using the Anthropic messages API with optional tool use."""

    def __init__(
        self,
        client: anthropic.AsyncAnthropic,
        system_prompt: str,
        model: str = "claude-sonnet-4-6",
        max_tokens: int = 4096,
        tools: list[Tool] | None = None,
        timeout_secs: int = 300,
    ) -> None:
        self.client = client
        self.system_prompt = system_prompt
        self.model = model
        self.max_tokens = max_tokens
        self.tools = {t.name: t for t in (tools or [])}
        self.timeout_secs = timeout_secs

    async def run(self, inp: RunInput) -> RunResult:
        """Execute the agent run, handling multi-turn tool calling automatically."""
        try:
            return await asyncio.wait_for(
                self._run_loop(inp),
                timeout=float(self.timeout_secs),
            )
        except asyncio.TimeoutError:
            raise RuntimeError(
                f"run {inp.run_id} timed out after {self.timeout_secs}s"
            )

    async def _run_loop(self, inp: RunInput) -> RunResult:
        # Build conversation history
        messages: list[dict[str, Any]] = [
            {"role": m.role, "content": m.content}
            for m in inp.history
        ]
        messages.append({"role": "user", "content": inp.message})

        tool_specs = [t.to_anthropic_format() for t in self.tools.values()]
        tool_results_log: list[ToolResult] = []
        total_input_tokens = 0
        total_output_tokens = 0
        turns = 0
        final_text = ""

        for turn in range(MAX_TURNS):
            turns = turn + 1
            kwargs: dict[str, Any] = dict(
                model=self.model,
                max_tokens=self.max_tokens,
                system=self.system_prompt,
                messages=messages,
            )
            if tool_specs:
                kwargs["tools"] = tool_specs

            response = await self.client.messages.create(**kwargs)

            total_input_tokens += response.usage.input_tokens
            total_output_tokens += response.usage.output_tokens

            if response.stop_reason == "end_turn":
                for block in response.content:
                    if hasattr(block, "text"):
                        final_text += block.text
                break

            if response.stop_reason == "tool_use":
                # Add assistant turn with tool_use blocks
                messages.append({
                    "role": "assistant",
                    "content": [b.model_dump() for b in response.content],
                })

                # Execute all tool calls, collect results
                tool_results: list[dict[str, Any]] = []
                for block in response.content:
                    if block.type != "tool_use":
                        continue

                    tool = self.tools.get(block.name)
                    if not tool:
                        result_text = f"Unknown tool: {block.name}"
                        tool_results_log.append(
                            ToolResult(tool_name=block.name, result="", error=result_text)
                        )
                    else:
                        try:
                            result_text = await tool.execute(block.input)
                            tool_results_log.append(
                                ToolResult(tool_name=block.name, result=result_text)
                            )
                        except Exception as exc:
                            result_text = f"Tool error: {exc}"
                            tool_results_log.append(
                                ToolResult(tool_name=block.name, result="", error=str(exc))
                            )

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_text,
                    })

                # Add tool results as user turn
                messages.append({"role": "user", "content": tool_results})
                continue

            # Unexpected stop reason — capture any text and break
            for block in response.content:
                if hasattr(block, "text"):
                    final_text += block.text
            break

        logger.info(
            "run completed",
            extra={
                "run_id": inp.run_id,
                "turns": turns,
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
            },
        )

        return RunResult(
            run_id=inp.run_id,
            output=final_text,
            tool_calls=tool_results_log,
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            turns=turns,
        )
