"""Tool definition primitives for agent function calling."""

from abc import ABC, abstractmethod
from typing import Any


class Tool(ABC):
    """Base class for all agent tools."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @property
    @abstractmethod
    def input_schema(self) -> dict[str, Any]: ...

    @abstractmethod
    async def execute(self, inputs: dict[str, Any]) -> str: ...

    def to_anthropic_format(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


class HttpFetchTool(Tool):
    """Fetch a URL and return the response body (text)."""

    name = "http_fetch"
    description = "Fetch the content of a URL. Use for accessing external data sources."
    input_schema = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "The URL to fetch"},
            "method": {
                "type": "string",
                "enum": ["GET", "POST"],
                "description": "HTTP method",
            },
        },
        "required": ["url"],
    }

    async def execute(self, inputs: dict[str, Any]) -> str:
        import httpx

        url = inputs["url"]
        method = inputs.get("method", "GET").upper()
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.request(method, url)
            resp.raise_for_status()
            return resp.text[:8_000]  # truncate to avoid token blowout
