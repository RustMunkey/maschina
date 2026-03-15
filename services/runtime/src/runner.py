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
from maschina_runtime import RunInput, RunResult
from maschina_runtime.runner import AgentRunner

from .config import settings
from .fallback import MAX_FALLBACK_ATTEMPTS, is_retriable, next_fallback
from .memory import retrieve_memories, store_memory
from .models import RunRequest, RunResponse
from .ollama_runner import OllamaRunner
from .openai_runner import OpenAIRunner
from .skills import build_tools
from .tracing import end_trace, fail_trace, start_trace

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


def _build_runner(model: str, req: RunRequest) -> AgentRunner | OllamaRunner | OpenAIRunner:
    """Instantiate the appropriate runner for the given model."""
    tools = build_tools(
        req.skills,
        req.skill_configs,
        caller_agent_id=req.agent_id,
        user_id=req.user_id,
    )

    if _is_ollama(model):
        return OllamaRunner(
            base_url=settings.ollama_base_url,
            model=_ollama_model_name(model),
            system_prompt=req.system_prompt,
            max_tokens=req.max_tokens,
            timeout_secs=req.timeout_secs,
        )
    if _is_openai(model):
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        return OpenAIRunner(
            api_key=settings.openai_api_key,
            model=model,
            system_prompt=req.system_prompt,
            max_tokens=req.max_tokens,
            timeout_secs=req.timeout_secs,
        )
    # Default: Anthropic (claude-*)
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    import anthropic

    return AgentRunner(
        client=anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key),
        model=model,
        system_prompt=req.system_prompt,
        max_tokens=req.max_tokens,
        tools=tools,
        timeout_secs=req.timeout_secs,
    )


async def _execute_with_fallback(req: RunRequest, run_input: RunInput) -> tuple[RunResult, str]:
    """
    Run the agent with cascade fallback on retriable provider errors.

    Tries the requested model first, then walks the fallback chain up to
    MAX_FALLBACK_ATTEMPTS times before giving up and re-raising.
    """
    model = req.model
    last_exc: Exception | None = None

    for attempt in range(MAX_FALLBACK_ATTEMPTS):
        runner = _build_runner(model, req)
        try:
            result = await runner.run(run_input)
            return result, model
        except Exception as exc:
            if not is_retriable(exc):
                raise

            last_exc = exc
            fallback = next_fallback(model)
            if fallback is None:
                logger.warning(
                    "no fallback available for model=%s after retriable error; giving up",
                    model,
                    exc_info=exc,
                )
                break

            logger.warning(
                "retriable error on model=%s (attempt %d/%d), falling back to model=%s",
                model,
                attempt + 1,
                MAX_FALLBACK_ATTEMPTS,
                fallback,
                exc_info=exc,
            )
            model = fallback

    await fail_trace(run_id=req.run_id, error=str(last_exc))
    raise RuntimeError(f"all fallback attempts exhausted for run {req.run_id}") from last_exc


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

    # ── Retrieve episodic memories ──────────────────────────────────────────
    memories = retrieve_memories(req.agent_id, req.user_id, user_message)
    if memories:
        memory_block = "\n".join(f"- {m}" for m in memories)
        req = req.model_copy(
            update={
                "system_prompt": (
                    f"{req.system_prompt}\n\n"
                    f"## Relevant memories from past interactions\n{memory_block}"
                )
            }
        )
        logger.debug("Injected %d memories for agent=%s", len(memories), req.agent_id)

    run_input = RunInput(
        run_id=req.run_id,
        message=user_message,
    )

    trace_start = await start_trace(
        run_id=req.run_id,
        agent_id=req.agent_id,
        user_id=req.user_id,
        model=req.model,
        input_message=user_message,
    )

    # ── Route + cascade fallback ─────────────────────────────────────────────
    result, actual_model = await _execute_with_fallback(req, run_input)
    if actual_model != req.model:
        logger.warning(
            "cascade fallback: ran with model=%s (requested=%s)",
            actual_model,
            req.model,
        )

    # ── Post-run risk scan (result from cascade fallback) ───────────────────
    output_risk = check_output(result.output)
    if output_risk.flags:
        logger.warning(
            "output risk flags",
            extra={"run_id": req.run_id, "flags": [f.code for f in output_risk.flags]},
        )

    # ── LangSmith trace ─────────────────────────────────────────────────────
    await end_trace(
        run_id=req.run_id,
        output=result.output,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        start_time=trace_start,
    )

    # ── Store episodic memory ───────────────────────────────────────────────
    store_memory(req.agent_id, req.user_id, req.run_id, result.output, role="output")

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

    sandbox_type = _sandbox_type(req.skills)

    return RunResponse(
        run_id=req.run_id,
        output_payload={"text": result.output},
        input_tokens=billed_input_tokens,
        output_tokens=billed_output_tokens,
        sandbox_type=sandbox_type,
    )


def _sandbox_type(skills: list[str]) -> str | None:
    """Return sandbox descriptor if code_exec skill is active."""
    import platform

    if "code_exec" not in skills:
        return None
    return "subprocess_rlimit" if platform.system() != "Windows" else "subprocess"
