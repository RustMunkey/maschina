"""Async httpx-based Maschina API client."""

from __future__ import annotations

import contextlib
from typing import Any, TypeVar

import httpx

from .errors import MaschinaError
from .types import (
    Agent,
    AgentRun,
    ApiKey,
    CreateAgentInput,
    CreateKeyInput,
    CreateKeyResponse,
    RunAgentInput,
    Subscription,
    UpdateAgentInput,
    UsageSummary,
)

T = TypeVar("T")

DEFAULT_BASE_URL = "https://api.maschina.ai"


class MaschinaClient:
    """
    Async Maschina API client.

    Usage::

        async with MaschinaClient(api_key="msk_live_...") as client:
            agents = await client.list_agents()
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "maschina-python-sdk/0.0.0",
            },
            timeout=timeout,
        )

    async def __aenter__(self) -> MaschinaClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def close(self) -> None:
        await self._client.aclose()

    # ── Agents ─────────────────────────────────────────────────────────────────

    async def list_agents(self) -> list[Agent]:
        data = await self._get("/agents")
        return [Agent.model_validate(a) for a in data]

    async def get_agent(self, agent_id: str) -> Agent:
        data = await self._get(f"/agents/{agent_id}")
        return Agent.model_validate(data)

    async def create_agent(self, input: CreateAgentInput) -> Agent:
        data = await self._post("/agents", input.model_dump(exclude_none=True))
        return Agent.model_validate(data)

    async def update_agent(self, agent_id: str, input: UpdateAgentInput) -> Agent:
        data = await self._patch(f"/agents/{agent_id}", input.model_dump(exclude_none=True))
        return Agent.model_validate(data)

    async def delete_agent(self, agent_id: str) -> None:
        await self._delete(f"/agents/{agent_id}")

    async def run_agent(self, agent_id: str, input: RunAgentInput) -> AgentRun:
        data = await self._post(f"/agents/{agent_id}/run", input.model_dump())
        return AgentRun.model_validate(data)

    async def list_agent_runs(self, agent_id: str) -> list[AgentRun]:
        data = await self._get(f"/agents/{agent_id}/runs")
        return [AgentRun.model_validate(r) for r in data]

    # ── API Keys ────────────────────────────────────────────────────────────────

    async def list_keys(self) -> list[ApiKey]:
        data = await self._get("/keys")
        return [ApiKey.model_validate(k) for k in data]

    async def create_key(self, input: CreateKeyInput) -> CreateKeyResponse:
        data = await self._post("/keys", input.model_dump(exclude_none=True))
        return CreateKeyResponse.model_validate(data)

    async def revoke_key(self, key_id: str) -> None:
        await self._delete(f"/keys/{key_id}")

    # ── Usage & Billing ─────────────────────────────────────────────────────────

    async def get_usage(self) -> UsageSummary:
        data = await self._get("/usage/summary")
        return UsageSummary.model_validate(data)

    async def get_subscription(self) -> Subscription | None:
        data = await self._get("/billing/subscription")
        return Subscription.model_validate(data) if data else None

    # ── HTTP helpers ────────────────────────────────────────────────────────────

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        res = await self._client.request(method, path, **kwargs)
        if not res.is_success:
            body: dict[str, Any] = {}
            with contextlib.suppress(Exception):
                body = res.json()
            err = body.get("error", {})
            message = err.get("message") or body.get("message") or res.reason_phrase
            code = body.get("error", {}).get("code") or body.get("code")
            raise MaschinaError(message, res.status_code, code)
        if res.status_code == 204:
            return None
        return res.json()

    async def _get(self, path: str) -> Any:
        return await self._request("GET", path)

    async def _post(self, path: str, body: dict[str, Any]) -> Any:
        return await self._request("POST", path, json=body)

    async def _patch(self, path: str, body: dict[str, Any]) -> Any:
        return await self._request("PATCH", path, json=body)

    async def _delete(self, path: str) -> Any:
        return await self._request("DELETE", path)
