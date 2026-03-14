"""
Agent execution — delegates to maschina-runtime (the shared execution package)
and runs risk checks via maschina-risk before and after the LLM call.

Model routing (by prefix):
  ollama/*   → OllamaRunner (local, no token quota deduction)
  claude-*   → AnthropicRunner (requires ANTHROPIC_API_KEY)
  gpt-* / o* → OpenAIRunner (requires OPENAI_API_KEY)

Unknown prefixes raise a RuntimeError.

Token billing multipliers are sourced from the catalog in packages/model.
Unknown models fall back to 2x (passthrough rate).
"""

import logging
from typing import Any

from maschina_risk import check_input, check_output
from maschina_runtime import RunInput

from .config import settings
from .models import RunRequest, RunResponse
from .ollama_runner import OllamaRunner

logger = logging.getLogger(__name__)

# ─── Token billing multipliers ────────────────────────────────────────────────
# Must stay in sync with packages/model/src/catalog.ts

_MULTIPLIERS: list[tuple[str, int]] = [
    ("claude-haiku-", 1),
    ("claude-sonnet-", 3),
    ("claude-opus-", 15),
    ("gpt-5-nano", 1),
    ("gpt-5-mini", 1),
    ("gpt-5.4-pro", 25),
    ("gpt-5.4", 10),
    ("gpt-5", 8),
    ("gpt-4o-mini", 1),
    ("gpt-4o", 4),
    ("gpt-4.1-mini", 1),
    ("gpt-4.1-nano", 1),
    ("gpt-4.1", 4),
    ("o4-mini", 2),
    ("o3-mini", 2),
    ("o3-pro", 25),
    ("o3", 20),
    ("ollama/", 0),
]

_PASSTHROUGH_MULTIPLIER = 2  # flat rate for unlisted models


def _get_multiplier(model: str) -> int:
    for prefix, mult in _MULTIPLIERS:
        if model.startswith(prefix):
            return mult
    return _PASSTHROUGH_MULTIPLIER


def _is_ollama(model: str) -> bool:
    return model.startswith("ollama/")


def _is_openai(model: str) -> bool:
    return model.startswith(("gpt-", "o1", "o3", "o4"))


def _ollama_model_name(model: str) -> str:
    """Strip 'ollama/' prefix to get the bare Ollama model name."""
    return model[len("ollama/") :]


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
    2. Route to the appropriate runner based on model prefix
    3. Risk-scan the output (flag PII leakage)
    4. Apply token billing multiplier to reported token counts
    5. Return structured response
    """
    user_message = _extract_user_message(req.input_payload)

    # ── Pre-run risk check ──────────────────────────────────────────────────
    risk = check_input(user_message)
    if not risk.approved:
        codes = ", ".join(f.code for f in risk.flags)
        raise ValueError(f"Input blocked by risk check: {codes}")

    # ── Route to runner ─────────────────────────────────────────────────────
    if _is_ollama(req.model):
        runner = OllamaRunner(
            base_url=settings.ollama_base_url,
            model=_ollama_model_name(req.model),
            system_prompt=req.system_prompt,
            max_tokens=min(req.max_tokens, settings.max_output_tokens),
            timeout_secs=req.timeout_secs,
        )

    elif _is_openai(req.model):
        try:
            import openai as _openai_check  # noqa: F401
        except ImportError as exc:
            raise RuntimeError("openai package not installed — run: pip install openai") from exc

        if not settings.openai_api_key:
            raise RuntimeError(f"OPENAI_API_KEY is not set but model '{req.model}' requires it")

        from .openai_runner import OpenAIRunner

        runner = OpenAIRunner(
            api_key=settings.openai_api_key,
            model=req.model,
            system_prompt=req.system_prompt,
            max_tokens=min(req.max_tokens, settings.max_output_tokens),
            timeout_secs=req.timeout_secs,
        )

    else:
        # Anthropic (claude-*) or unknown prefix treated as Anthropic
        if not settings.anthropic_api_key:
            raise RuntimeError(f"ANTHROPIC_API_KEY is not set but model '{req.model}' requires it")

        try:
            import anthropic
        except ImportError as exc:
            raise RuntimeError("anthropic package not installed") from exc

        from maschina_runtime import AgentRunner

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        runner = AgentRunner(
            client=client,
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

    # ── Apply billing multiplier ────────────────────────────────────────────
    multiplier = _get_multiplier(req.model)
    billed_input_tokens = result.input_tokens * multiplier
    billed_output_tokens = result.output_tokens * multiplier

    logger.info(
        "run completed",
        extra={
            "run_id": req.run_id,
            "model": req.model,
            "turns": result.turns,
            "raw_input_tokens": result.input_tokens,
            "raw_output_tokens": result.output_tokens,
            "billed_input_tokens": billed_input_tokens,
            "billed_output_tokens": billed_output_tokens,
            "multiplier": multiplier,
        },
    )

    return RunResponse(
        run_id=req.run_id,
        output_payload={"text": result.output},
        input_tokens=billed_input_tokens,
        output_tokens=billed_output_tokens,
    )
