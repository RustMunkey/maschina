"""
Model cascade fallback — retries on retriable provider errors with a cheaper model.

Fallback chains mirror the tier hierarchy in packages/model/src/catalog.ts.
Only provider-side errors (rate limit, overload, unavailable) trigger a fallback.
Input errors (invalid prompt, token limit exceeded by input) are not retried.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# ─── Fallback chain ───────────────────────────────────────────────────────────
# Maps model ID → next model to try on retriable failure.
# Chains are intentionally short — max 2 hops to avoid excessive latency.

_FALLBACK_CHAIN: dict[str, str] = {
    # Anthropic — opus → sonnet → haiku
    "claude-opus-4-6": "claude-sonnet-4-6",
    "claude-opus-4-5": "claude-sonnet-4-6",
    "claude-opus-4-20250514": "claude-sonnet-4-6",
    "claude-sonnet-4-6": "claude-haiku-4-5",
    "claude-sonnet-4-5": "claude-haiku-4-5",
    "claude-sonnet-4-20250514": "claude-haiku-4-5",
    # OpenAI GPT-5 — pro → standard → mini
    "gpt-5.4-pro": "gpt-5.4",
    "gpt-5.4": "gpt-5",
    "gpt-5": "gpt-5-mini",
    # OpenAI o-series — pro → base → mini
    "o3-pro": "o3",
    "o3": "o3-mini",
    # OpenAI GPT-4.x legacy
    "gpt-4.1": "gpt-4.1-mini",
    "gpt-4o": "gpt-4o-mini",
}

MAX_FALLBACK_ATTEMPTS = 3


def next_fallback(model: str) -> str | None:
    """Return the next model in the fallback chain, or None if no fallback exists."""
    return _FALLBACK_CHAIN.get(model)


def is_retriable_anthropic_error(exc: Exception) -> bool:
    """True for Anthropic errors that warrant a model fallback."""
    try:
        import anthropic

        if isinstance(exc, anthropic.RateLimitError):
            return True
        if isinstance(exc, anthropic.APIStatusError):
            # 529 = overloaded, 503 = service unavailable, 502 = bad gateway
            return exc.status_code in (502, 503, 529)
        if isinstance(exc, anthropic.APIConnectionError):
            return True
    except ImportError:
        pass
    return False


def is_retriable_openai_error(exc: Exception) -> bool:
    """True for OpenAI errors that warrant a model fallback."""
    try:
        import openai

        if isinstance(exc, openai.RateLimitError):
            return True
        if isinstance(exc, openai.APIStatusError):
            return exc.status_code in (502, 503, 529)
        if isinstance(exc, openai.APIConnectionError):
            return True
    except ImportError:
        pass
    return False


def is_retriable(exc: Exception) -> bool:
    return is_retriable_anthropic_error(exc) or is_retriable_openai_error(exc)
