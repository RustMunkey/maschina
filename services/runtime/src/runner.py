"""
Agent execution — delegates to maschina-runtime (the shared execution package)
and runs risk checks via maschina-risk before and after the LLM call.
"""

import logging
from typing import Any

from maschina_risk import check_input, check_output
from maschina_runtime import RunInput

from .config import settings
from .models import RunRequest, RunResponse
from .ollama_runner import OllamaRunner

logger = logging.getLogger(__name__)

# Lazily import Anthropic only if an API key is configured
if not settings.use_ollama:
    import anthropic

    _anthropic_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
else:
    _anthropic_client = None  # type: ignore[assignment]


def _extract_user_message(input_payload: dict[str, Any]) -> str:
    import json

    if "message" in input_payload:
        return str(input_payload["message"])
    return json.dumps(input_payload)


async def execute(req: RunRequest) -> RunResponse:
    """
    Execute an agent run.

    Pipeline:
    1. Risk-check the user input (block prompt injection / oversized inputs)
    2. Run the agent via maschina-runtime AgentRunner
    3. Risk-scan the output (flag PII leakage)
    4. Return structured response
    """
    user_message = _extract_user_message(req.input_payload)

    # ── Pre-run risk check ──────────────────────────────────────────────────
    risk = check_input(user_message)
    if not risk.approved:
        codes = ", ".join(f.code for f in risk.flags)
        raise ValueError(f"Input blocked by risk check: {codes}")

    # ── Execute via maschina-runtime ────────────────────────────────────────
    if settings.use_ollama:
        runner = OllamaRunner(
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
            system_prompt=req.system_prompt,
            max_tokens=min(req.max_tokens, settings.max_output_tokens),
            timeout_secs=req.timeout_secs,
        )
    else:
        from maschina_runtime import AgentRunner

        runner = AgentRunner(
            client=_anthropic_client,
            system_prompt=req.system_prompt,
            model=req.model,
            max_tokens=min(req.max_tokens, settings.max_output_tokens),
            timeout_secs=req.timeout_secs,
        )

    run_input = RunInput(
        run_id=req.run_id,
        message=user_message,
    )

    result = await runner.run(run_input)

    # ── Post-run risk scan ──────────────────────────────────────────────────
    output_risk = check_output(result.output)
    if output_risk.flags:
        logger.warning(
            "output risk flags",
            extra={"run_id": req.run_id, "flags": [f.code for f in output_risk.flags]},
        )

    logger.info(
        "run completed",
        extra={
            "run_id": req.run_id,
            "model": req.model,
            "turns": result.turns,
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
        },
    )

    return RunResponse(
        run_id=req.run_id,
        output_payload={"text": result.output},
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
