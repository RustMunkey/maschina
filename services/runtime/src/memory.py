"""
Agent episodic memory — retrieve relevant past interactions before a run,
store a new memory after completion.

Storage: Qdrant collection "agent_memory"
Embeddings: OpenAI text-embedding-3-small (1536 dims)
  Falls back gracefully (no-op) when Qdrant or OpenAI is unavailable.

Point payload schema:
  agent_id : str  — scopes memory to a specific agent
  user_id  : str  — scopes memory to a specific user
  run_id   : str  — source run (for deduplication / deletion)
  role     : "input" | "output"
  text     : str  — the original text that was embedded
  timestamp: float — Unix epoch
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import TYPE_CHECKING

from .config import settings

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

_COLLECTION = "agent_memory"
_EMBED_MODEL = "text-embedding-3-small"
_EMBED_DIMS = 1536


def _qdrant_client():
    """Return a QdrantClient or None if unavailable."""
    try:
        from qdrant_client import QdrantClient

        kwargs: dict = {"url": settings.qdrant_url}
        if settings.qdrant_api_key:
            kwargs["api_key"] = settings.qdrant_api_key
        return QdrantClient(**kwargs)
    except Exception as exc:
        logger.debug("Qdrant unavailable: %s", exc)
        return None


def _openai_client():
    """Return an OpenAI client or None if unavailable."""
    try:
        import openai

        key = settings.openai_api_key
        if not key:
            return None
        return openai.OpenAI(api_key=key)
    except Exception as exc:
        logger.debug("OpenAI client unavailable: %s", exc)
        return None


def _embed(client, text: str) -> list[float] | None:
    try:
        resp = client.embeddings.create(model=_EMBED_MODEL, input=text)
        return resp.data[0].embedding
    except Exception as exc:
        logger.warning("Embedding failed: %s", exc)
        return None


def _ensure_collection(qdrant) -> bool:
    """Create the agent_memory collection if it does not exist. Returns True on success."""
    try:
        from qdrant_client.models import Distance, VectorParams

        existing = {c.name for c in qdrant.get_collections().collections}
        if _COLLECTION not in existing:
            qdrant.create_collection(
                collection_name=_COLLECTION,
                vectors_config=VectorParams(size=_EMBED_DIMS, distance=Distance.COSINE),
            )
        return True
    except Exception as exc:
        logger.warning("Could not ensure agent_memory collection: %s", exc)
        return False


# ─── Public API ───────────────────────────────────────────────────────────────


def retrieve_memories(agent_id: str, user_id: str, query_text: str) -> list[str]:
    """
    Return up to settings.memory_top_k relevant memories for this agent+user
    as plain text strings, ready to inject into the system prompt.
    Returns an empty list on any failure.
    """
    if not settings.memory_enabled:
        return []

    qdrant = _qdrant_client()
    if qdrant is None:
        return []

    oai = _openai_client()
    if oai is None:
        return []

    vector = _embed(oai, query_text)
    if vector is None:
        return []

    try:
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        hits = qdrant.search(
            collection_name=_COLLECTION,
            query_vector=vector,
            query_filter=Filter(
                must=[
                    FieldCondition(key="agent_id", match=MatchValue(value=agent_id)),
                    FieldCondition(key="user_id", match=MatchValue(value=user_id)),
                ]
            ),
            limit=settings.memory_top_k,
            with_payload=True,
        )
        return [hit.payload["text"] for hit in hits if hit.payload and "text" in hit.payload]
    except Exception as exc:
        logger.warning("Memory retrieval failed: %s", exc)
        return []


def store_memory(agent_id: str, user_id: str, run_id: str, text: str, role: str = "output") -> None:
    """
    Embed `text` and upsert it into agent_memory.
    Fire-and-forget — all errors are logged and swallowed.
    """
    if not settings.memory_enabled or not text.strip():
        return

    qdrant = _qdrant_client()
    if qdrant is None:
        return

    oai = _openai_client()
    if oai is None:
        return

    vector = _embed(oai, text)
    if vector is None:
        return

    if not _ensure_collection(qdrant):
        return

    try:
        from qdrant_client.models import PointStruct

        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={
                "agent_id": agent_id,
                "user_id": user_id,
                "run_id": run_id,
                "role": role,
                "text": text,
                "timestamp": time.time(),
            },
        )
        qdrant.upsert(collection_name=_COLLECTION, points=[point])
        logger.debug("Stored memory for agent=%s run=%s role=%s", agent_id, run_id, role)
    except Exception as exc:
        logger.warning("Memory store failed: %s", exc)


def delete_agent_memories(agent_id: str) -> int:
    """
    Delete all memory points for the given agent. Returns count deleted.
    Used by DELETE /agents/:id/memory.
    """
    qdrant = _qdrant_client()
    if qdrant is None:
        return 0

    try:
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        result = qdrant.delete(
            collection_name=_COLLECTION,
            points_selector=Filter(
                must=[FieldCondition(key="agent_id", match=MatchValue(value=agent_id))]
            ),
        )
        deleted = getattr(result, "deleted_count", 0) or 0
        logger.info("Deleted %d memory points for agent=%s", deleted, agent_id)
        return deleted
    except Exception as exc:
        logger.warning("Memory delete failed: %s", exc)
        return 0
