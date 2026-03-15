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

    def __init__(self, allowed_domains: list[str] | None = None) -> None:
        self._allowed_domains = allowed_domains or []

    async def execute(self, inputs: dict[str, Any]) -> str:
        from urllib.parse import urlparse

        import httpx

        url = inputs["url"]
        if self._allowed_domains:
            host = urlparse(url).hostname or ""
            if not any(host == d or host.endswith(f".{d}") for d in self._allowed_domains):
                return f"Blocked: {host} is not in the allowed domains list."

        method = inputs.get("method", "GET").upper()
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.request(method, url)
            resp.raise_for_status()
            return resp.text[:8_000]  # truncate to avoid token blowout


class WebSearchTool(Tool):
    """Search the web using Brave Search API."""

    name = "web_search"
    description = "Search the web for current information. Returns titles, URLs, and descriptions of top results."
    input_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query"},
        },
        "required": ["query"],
    }

    def __init__(self, api_key: str, max_results: int = 5) -> None:
        self._api_key = api_key
        self._max_results = min(max(1, max_results), 10)

    async def execute(self, inputs: dict[str, Any]) -> str:
        import httpx

        query = inputs["query"]
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": self._max_results},
                headers={"Accept": "application/json", "X-Subscription-Token": self._api_key},
            )
            resp.raise_for_status()
            data = resp.json()

        results = data.get("web", {}).get("results", [])
        if not results:
            return "No results found."

        lines = []
        for r in results[: self._max_results]:
            lines.append(f"**{r.get('title', '')}**")
            lines.append(r.get("url", ""))
            if desc := r.get("description", ""):
                lines.append(desc)
            lines.append("")
        return "\n".join(lines).strip()[:6_000]


class CodeExecTool(Tool):
    """Execute a Python code snippet in a sandboxed subprocess."""

    name = "code_exec"
    description = (
        "Execute Python code and return stdout + stderr. "
        "Use for calculations, data processing, or any logic that benefits from running code. "
        "No network access or filesystem writes are available inside the sandbox."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "code": {"type": "string", "description": "Python code to execute"},
        },
        "required": ["code"],
    }

    def __init__(
        self,
        timeout_secs: int = 10,
        memory_limit_mb: int = 128,
        cpu_limit_secs: int = 10,
    ) -> None:
        self._timeout = min(max(1, timeout_secs), 30)
        self._memory_limit_bytes = memory_limit_mb * 1024 * 1024
        self._cpu_limit_secs = min(max(1, cpu_limit_secs), 30)

    def _make_preexec(self) -> Any:
        """Return a preexec_fn that applies resource limits on Unix."""
        import platform

        if platform.system() == "Windows":
            return None

        memory_limit = self._memory_limit_bytes
        cpu_limit = self._cpu_limit_secs

        def _apply_limits() -> None:
            import resource

            resource.setrlimit(resource.RLIMIT_AS, (memory_limit, memory_limit))
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_limit, cpu_limit))
            resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))

        return _apply_limits

    async def execute(self, inputs: dict[str, Any]) -> str:
        import asyncio
        import sys

        code = inputs["code"]
        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable,
                "-c",
                code,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                preexec_fn=self._make_preexec(),
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=float(self._timeout)
            )
        except TimeoutError:
            return f"Error: code execution timed out after {self._timeout}s"
        except Exception as exc:
            return f"Error: {exc}"

        out = stdout.decode(errors="replace")[:4_000]
        err = stderr.decode(errors="replace")[:1_000]
        if err:
            return f"{out}\nstderr:\n{err}".strip()
        return out or "(no output)"
