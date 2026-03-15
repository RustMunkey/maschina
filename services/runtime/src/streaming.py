"""
Streaming execution endpoint — yields SSE chunks as the LLM generates tokens.

Called by the daemon during EXECUTE phase when streaming is enabled.
Each chunk is a JSON-encoded SSE event forwarded to the realtime service,
which fans it out to the connected client over WebSocket/SSE.

Chunk types:
  { "type": "chunk", "run_id": "...", "text": "...", "index": N }
  { "type": "done",  "run_id": "...", "input_tokens": N, "output_tokens": N,
    "sandbox_type": "..." | null }
  { "type": "error", "run_id": "...", "message": "..." }
"""

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import anthropic
from fastapi.responses import StreamingResponse

from .config import settings
from .models import RunRequest
from .runner import (
    _extract_user_message,
    _get_multiplier,
    _is_ollama,
    _is_openai,
    _sandbox_type,
)

logger = logging.getLogger(__name__)


def _sse(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def stream_run(req: RunRequest) -> StreamingResponse:
    """Return a StreamingResponse that yields SSE chunks for this run."""
    return StreamingResponse(
        _generate(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def _generate(req: RunRequest) -> AsyncGenerator[str, None]:
    user_message = _extract_user_message(req.input_payload)
    multiplier = _get_multiplier(req.model)

    try:
        if _is_ollama(req.model):
            async for chunk in _stream_ollama(req, user_message):
                yield chunk
        elif _is_openai(req.model):
            async for chunk in _stream_openai(req, user_message, multiplier):
                yield chunk
        else:
            async for chunk in _stream_anthropic(req, user_message, multiplier):
                yield chunk
    except Exception as exc:
        logger.exception("streaming run failed", extra={"run_id": req.run_id})
        yield _sse({"type": "error", "run_id": req.run_id, "message": str(exc)})


# ─── Anthropic streaming ──────────────────────────────────────────────────────


async def _stream_anthropic(
    req: RunRequest,
    user_message: str,
    multiplier: int,
) -> AsyncGenerator[str, None]:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    index = 0

    async with client.messages.stream(
        model=req.model,
        max_tokens=req.max_tokens,
        system=req.system_prompt,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        async for text in stream.text_stream:
            yield _sse({"type": "chunk", "run_id": req.run_id, "text": text, "index": index})
            index += 1

        final = await stream.get_final_message()
        input_tokens = (final.usage.input_tokens or 0) * multiplier
        output_tokens = (final.usage.output_tokens or 0) * multiplier

    yield _sse(
        {
            "type": "done",
            "run_id": req.run_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "sandbox_type": _sandbox_type(req.skills),
        }
    )


# ─── OpenAI streaming ─────────────────────────────────────────────────────────


async def _stream_openai(
    req: RunRequest,
    user_message: str,
    multiplier: int,
) -> AsyncGenerator[str, None]:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    import openai

    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    index = 0
    input_tokens = 0
    output_tokens = 0

    async with client.chat.completions.stream(
        model=req.model,
        max_tokens=req.max_tokens,
        messages=[
            {"role": "system", "content": req.system_prompt},
            {"role": "user", "content": user_message},
        ],
    ) as stream:
        async for event in stream:
            if event.type == "content.delta" and event.delta.content:
                yield _sse(
                    {
                        "type": "chunk",
                        "run_id": req.run_id,
                        "text": event.delta.content,
                        "index": index,
                    }
                )
                index += 1
            elif event.type == "chunk" and event.chunk.usage:
                input_tokens = (event.chunk.usage.prompt_tokens or 0) * multiplier
                output_tokens = (event.chunk.usage.completion_tokens or 0) * multiplier

    yield _sse(
        {
            "type": "done",
            "run_id": req.run_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "sandbox_type": _sandbox_type(req.skills),
        }
    )


# ─── Ollama streaming ─────────────────────────────────────────────────────────


async def _stream_ollama(
    req: RunRequest,
    user_message: str,
) -> AsyncGenerator[str, None]:
    import httpx

    model_name = req.model[len("ollama/") :]
    index = 0

    async with httpx.AsyncClient(timeout=req.timeout_secs) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": model_name,
                "messages": [
                    {"role": "system", "content": req.system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "stream": True,
            },
        ) as response:
            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue

                content = data.get("message", {}).get("content", "")
                if content:
                    yield _sse(
                        {
                            "type": "chunk",
                            "run_id": req.run_id,
                            "text": content,
                            "index": index,
                        }
                    )
                    index += 1

                if data.get("done"):
                    yield _sse(
                        {
                            "type": "done",
                            "run_id": req.run_id,
                            "input_tokens": data.get("prompt_eval_count", 0),
                            "output_tokens": data.get("eval_count", 0),
                            "sandbox_type": _sandbox_type(req.skills),
                        }
                    )
                    return
