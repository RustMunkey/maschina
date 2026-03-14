"""OpenAI runner — routes gpt-* and o* models to the OpenAI API."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from maschina_runtime.models import RunInput, RunResult
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

MAX_TURNS = 20


class OpenAIRunner:
    """Runs agents against the OpenAI API (gpt-*, o1, o3, o4 series)."""

    def __init__(
        self,
        api_key: str,
        model: str,
        system_prompt: str,
        max_tokens: int = 4096,
        timeout_secs: int = 300,
    ) -> None:
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model
        self.system_prompt = system_prompt
        self.max_tokens = max_tokens
        self.timeout_secs = timeout_secs

    async def run(self, inp: RunInput) -> RunResult:
        try:
            return await asyncio.wait_for(
                self._run_loop(inp),
                timeout=float(self.timeout_secs),
            )
        except TimeoutError:
            raise RuntimeError(f"run {inp.run_id} timed out after {self.timeout_secs}s")

    async def _run_loop(self, inp: RunInput) -> RunResult:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": self.system_prompt},
            *[{"role": m.role, "content": m.content} for m in inp.history],
            {"role": "user", "content": inp.message},
        ]

        total_input_tokens = 0
        total_output_tokens = 0
        final_text = ""

        for turn in range(MAX_TURNS):
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,  # type: ignore[arg-type]
                max_tokens=self.max_tokens,
            )

            choice = response.choices[0]
            usage = response.usage
            if usage:
                total_input_tokens += usage.prompt_tokens
                total_output_tokens += usage.completion_tokens

            content = choice.message.content or ""
            final_text = content

            if choice.finish_reason in ("stop", "length", None):
                break

            messages.append({"role": "assistant", "content": content})

        logger.info(
            "openai run completed",
            extra={
                "run_id": inp.run_id,
                "model": self.model,
                "turns": turn + 1,
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
            },
        )

        return RunResult(
            run_id=inp.run_id,
            output=final_text,
            tool_calls=[],
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            turns=turn + 1,
        )
