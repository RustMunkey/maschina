"""
Agent execution — delegates to maschina-runtime (the shared execution package)
and runs risk checks via maschina-risk before and after the LLM call.

Model routing:
  - Models starting with "ollama/" → OllamaRunner (local, no token quota deduction)
  - All other models              → AnthropicRunner (cloud, billed with multiplier)

Token billing multipliers (applied to raw token counts before returning):
  claude-haiku-*   → 1x
  claude-sonnet-*  → 3x
  claude-opus-*    → 15x
  ollama/*         → 0x  (local, never deducted from quota)
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
    ("ollama/", 0),
]

_DEFAULT_MULTIPLIER = 1


def _get_multiplier(model: str) -> int:
    for prefix, mult in _MULTIPLIERS:
        if model.startswith(prefix):
            return mult
    return _DEFAULT_MULTIPLIER


def _is_ollama(model: str) -> bool:
    return model.startswith("ollama/")


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
        # Local Ollama — use the model name from the request
        runner = OllamaRunner(
            base_url=settings.ollama_base_url,
            model=_ollama_model_name(req.model),
            system_prompt=req.system_prompt,
            max_tokens=min(req.max_tokens, settings.max_output_tokens),
            timeout_secs=req.timeout_secs,
        )
    else:
        # Cloud Anthropic model — lazy-import to avoid requiring the key for local dev
        try:
            import anthropic

            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        except ImportError as exc:
            raise RuntimeError("anthropic package not installed") from exc

        if not settings.anthropic_api_key:
            raise RuntimeError(
                f"ANTHROPIC_API_KEY is not set but model '{req.model}' requires cloud execution"
            )

        from maschina_runtime import AgentRunner

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
    # Multiply raw token counts so the daemon's quota deduction reflects cost.
    # Ollama multiplier = 0, so local runs never deduct from the cloud quota.
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
