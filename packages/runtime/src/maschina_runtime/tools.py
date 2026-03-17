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


def _is_private_host(hostname: str) -> bool:
    """Return True if hostname resolves to a private/internal address.

    Blocks SSRF attacks targeting localhost, RFC-1918 ranges, link-local
    (169.254.x.x — cloud metadata endpoints), and loopback IPv6.
    Resolution is synchronous and intentionally done at call time so
    late-binding DNS rebinding attacks are also caught.
    """
    import ipaddress
    import socket

    try:
        # getaddrinfo returns all A/AAAA records; check every one
        results = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False  # unresolvable host — let httpx handle the error

    for *_, sockaddr in results:
        ip_str = sockaddr[0]
        try:
            addr = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            addr.is_loopback
            or addr.is_private
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_unspecified
        ):
            return True
    return False


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
        parsed = urlparse(url)
        host = parsed.hostname or ""

        # Always block private/internal addresses regardless of allowed_domains.
        # This prevents SSRF against localhost, cloud metadata endpoints (169.254.x.x),
        # and internal services even when no domain allowlist is configured.
        if _is_private_host(host):
            return f"Blocked: {host} resolves to a private/internal address."

        # Schema must be http or https — block file://, ftp://, etc.
        if parsed.scheme not in ("http", "https"):
            return f"Blocked: scheme '{parsed.scheme}' is not allowed."

        if self._allowed_domains:
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


class SlackTool(Tool):
    """Post messages and read channel history from Slack."""

    name = "slack"
    description = (
        "Interact with Slack. Can post messages to channels and list recent messages. "
        "Requires a connected Slack workspace."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["post_message", "list_channels", "get_messages"],
                "description": "Action to perform",
            },
            "channel": {"type": "string", "description": "Channel name or ID"},
            "text": {"type": "string", "description": "Message text (for post_message)"},
            "limit": {
                "type": "integer",
                "description": "Number of messages to retrieve",
                "default": 10,
            },
        },
        "required": ["action"],
    }

    def __init__(self, access_token: str) -> None:
        self._token = access_token

    async def execute(self, inputs: dict[str, Any]) -> str:
        import httpx

        action = inputs["action"]
        headers = {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=10) as client:
            if action == "post_message":
                channel = inputs.get("channel", "")
                text = inputs.get("text", "")
                if not channel or not text:
                    return "Error: channel and text are required for post_message"
                resp = await client.post(
                    "https://slack.com/api/chat.postMessage",
                    headers=headers,
                    json={"channel": channel, "text": text},
                )
                data = resp.json()
                return "Message sent." if data.get("ok") else f"Error: {data.get('error')}"

            elif action == "list_channels":
                resp = await client.get("https://slack.com/api/conversations.list", headers=headers)
                data = resp.json()
                if not data.get("ok"):
                    return f"Error: {data.get('error')}"
                channels = data.get("channels", [])
                lines = [f"#{c['name']} ({c['id']})" for c in channels[:20]]
                return "\n".join(lines) or "No channels found."

            elif action == "get_messages":
                channel = inputs.get("channel", "")
                limit = int(inputs.get("limit", 10))
                if not channel:
                    return "Error: channel is required for get_messages"
                resp = await client.get(
                    "https://slack.com/api/conversations.history",
                    headers=headers,
                    params={"channel": channel, "limit": limit},
                )
                data = resp.json()
                if not data.get("ok"):
                    return f"Error: {data.get('error')}"
                messages = data.get("messages", [])
                lines = [f"[{m.get('ts', '')}] {m.get('text', '')}" for m in messages]
                return "\n".join(lines) or "No messages."

            return f"Unknown action: {action}"


class GitHubTool(Tool):
    """Create and list issues, read pull requests in GitHub repositories."""

    name = "github"
    description = (
        "Interact with GitHub. Can create issues, list issues, and read pull requests. "
        "Requires a connected GitHub account."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["create_issue", "list_issues", "get_pull_request"],
                "description": "Action to perform",
            },
            "repo": {"type": "string", "description": "Repository in owner/repo format"},
            "title": {"type": "string", "description": "Issue title (for create_issue)"},
            "body": {"type": "string", "description": "Issue body (for create_issue)"},
            "number": {"type": "integer", "description": "PR or issue number"},
            "state": {"type": "string", "enum": ["open", "closed", "all"], "default": "open"},
        },
        "required": ["action", "repo"],
    }

    def __init__(self, access_token: str, default_repo: str = "") -> None:
        self._token = access_token
        self._default_repo = default_repo

    async def execute(self, inputs: dict[str, Any]) -> str:
        import httpx

        action = inputs["action"]
        repo = inputs.get("repo") or self._default_repo
        if not repo:
            return "Error: repo is required (e.g. owner/repo)"

        headers = {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

        async with httpx.AsyncClient(timeout=10) as client:
            if action == "create_issue":
                title = inputs.get("title", "")
                body = inputs.get("body", "")
                if not title:
                    return "Error: title is required for create_issue"
                resp = await client.post(
                    f"https://api.github.com/repos/{repo}/issues",
                    headers=headers,
                    json={"title": title, "body": body},
                )
                if resp.status_code == 201:
                    data = resp.json()
                    return f"Created issue #{data['number']}: {data['html_url']}"
                return f"Error {resp.status_code}: {resp.text[:500]}"

            elif action == "list_issues":
                state = inputs.get("state", "open")
                resp = await client.get(
                    f"https://api.github.com/repos/{repo}/issues",
                    headers=headers,
                    params={"state": state, "per_page": 20},
                )
                if resp.status_code != 200:
                    return f"Error {resp.status_code}: {resp.text[:500]}"
                issues = resp.json()
                lines = [f"#{i['number']} [{i['state']}] {i['title']}" for i in issues]
                return "\n".join(lines) or "No issues found."

            elif action == "get_pull_request":
                number = inputs.get("number")
                if not number:
                    return "Error: number is required for get_pull_request"
                resp = await client.get(
                    f"https://api.github.com/repos/{repo}/pulls/{number}",
                    headers=headers,
                )
                if resp.status_code != 200:
                    return f"Error {resp.status_code}: {resp.text[:500]}"
                pr = resp.json()
                return (
                    f"PR #{pr['number']}: {pr['title']}\n"
                    f"State: {pr['state']}\n"
                    f"Author: {pr['user']['login']}\n"
                    f"URL: {pr['html_url']}\n"
                    f"Body: {(pr.get('body') or '')[:500]}"
                )

            return f"Unknown action: {action}"


class NotionTool(Tool):
    """Create and search pages in Notion workspaces."""

    name = "notion"
    description = (
        "Interact with Notion. Can create pages and search existing content. "
        "Requires a connected Notion integration."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["search", "create_page"],
                "description": "Action to perform",
            },
            "query": {"type": "string", "description": "Search query (for search)"},
            "parent_page_id": {"type": "string", "description": "Parent page ID (for create_page)"},
            "title": {"type": "string", "description": "Page title (for create_page)"},
            "content": {"type": "string", "description": "Page content as plain text"},
        },
        "required": ["action"],
    }

    def __init__(self, access_token: str) -> None:
        self._token = access_token

    async def execute(self, inputs: dict[str, Any]) -> str:
        import httpx

        action = inputs["action"]
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=10) as client:
            if action == "search":
                query = inputs.get("query", "")
                resp = await client.post(
                    "https://api.notion.com/v1/search",
                    headers=headers,
                    json={"query": query, "page_size": 10},
                )
                if resp.status_code != 200:
                    return f"Error {resp.status_code}: {resp.text[:500]}"
                results = resp.json().get("results", [])
                lines = []
                for r in results:
                    title = ""
                    props = r.get("properties", {})
                    title_prop = props.get("title") or props.get("Name") or {}
                    for t in title_prop.get("title", []):
                        title += t.get("plain_text", "")
                    lines.append(f"[{r['object']}] {title} ({r['id']})")
                return "\n".join(lines) or "No results."

            elif action == "create_page":
                parent_id = inputs.get("parent_page_id", "")
                title = inputs.get("title", "Untitled")
                content = inputs.get("content", "")
                if not parent_id:
                    return "Error: parent_page_id is required for create_page"
                body: dict[str, Any] = {
                    "parent": {"page_id": parent_id},
                    "properties": {"title": {"title": [{"text": {"content": title}}]}},
                }
                if content:
                    body["children"] = [
                        {
                            "object": "block",
                            "type": "paragraph",
                            "paragraph": {"rich_text": [{"text": {"content": content[:2000]}}]},
                        }
                    ]
                resp = await client.post(
                    "https://api.notion.com/v1/pages",
                    headers=headers,
                    json=body,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return f"Created page: {data.get('url', data['id'])}"
                return f"Error {resp.status_code}: {resp.text[:500]}"

            return f"Unknown action: {action}"


class LinearTool(Tool):
    """Create, list, and update issues in Linear projects."""

    name = "linear"
    description = (
        "Interact with Linear. Can create issues, list issues, and update issue status. "
        "Requires a connected Linear account."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["create_issue", "list_issues", "update_issue"],
                "description": "Action to perform",
            },
            "team_id": {"type": "string", "description": "Linear team ID or key"},
            "title": {"type": "string", "description": "Issue title (for create_issue)"},
            "description": {"type": "string", "description": "Issue description"},
            "issue_id": {"type": "string", "description": "Issue ID (for update_issue)"},
            "state_id": {"type": "string", "description": "Target state ID (for update_issue)"},
        },
        "required": ["action"],
    }

    def __init__(self, access_token: str, default_team: str = "") -> None:
        self._token = access_token
        self._default_team = default_team

    async def _graphql(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.linear.app/graphql",
                headers={"Authorization": self._token, "Content-Type": "application/json"},
                json={"query": query, "variables": variables},
            )
            resp.raise_for_status()
            return resp.json()

    async def execute(self, inputs: dict[str, Any]) -> str:
        action = inputs["action"]

        if action == "create_issue":
            team_id = inputs.get("team_id") or self._default_team
            title = inputs.get("title", "")
            if not team_id or not title:
                return "Error: team_id and title are required for create_issue"
            result = await self._graphql(
                "mutation CreateIssue($teamId: String!, $title: String!, $description: String) {"
                "  issueCreate(input: {teamId: $teamId, title: $title, description: $description}) {"
                "    issue { id identifier title url } } }",
                {"teamId": team_id, "title": title, "description": inputs.get("description", "")},
            )
            issue = result.get("data", {}).get("issueCreate", {}).get("issue")
            if issue:
                return f"Created {issue['identifier']}: {issue['title']}\n{issue['url']}"
            return f"Error: {result.get('errors', 'Unknown error')}"

        elif action == "list_issues":
            team_id = inputs.get("team_id") or self._default_team
            result = await self._graphql(
                "query Issues($teamId: String) { issues(filter: {team: {id: {eq: $teamId}}}, first: 20) {"
                "  nodes { identifier title state { name } priority } } }",
                {"teamId": team_id or None},
            )
            nodes = result.get("data", {}).get("issues", {}).get("nodes", [])
            lines = [f"[{n['identifier']}] {n['title']} — {n['state']['name']}" for n in nodes]
            return "\n".join(lines) or "No issues found."

        elif action == "update_issue":
            issue_id = inputs.get("issue_id", "")
            state_id = inputs.get("state_id", "")
            if not issue_id:
                return "Error: issue_id is required for update_issue"
            update: dict[str, Any] = {}
            if state_id:
                update["stateId"] = state_id
            if inputs.get("title"):
                update["title"] = inputs["title"]
            result = await self._graphql(
                "mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {"
                "  issueUpdate(id: $id, input: $input) { issue { identifier title } } }",
                {"id": issue_id, "input": update},
            )
            issue = result.get("data", {}).get("issueUpdate", {}).get("issue")
            if issue:
                return f"Updated {issue['identifier']}: {issue['title']}"
            return f"Error: {result.get('errors', 'Unknown error')}"

        return f"Unknown action: {action}"


class DelegateAgentTool(Tool):
    """Delegate a subtask to another Maschina agent and await its result."""

    name = "delegate_agent"
    description = (
        "Delegate a subtask to another Maschina agent by ID and get back its result. "
        "Use for multi-agent collaboration — hand off specialised work to the right agent. "
        "Call GET /agents/discover to find available agents."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "agent_id": {
                "type": "string",
                "description": "ID of the target agent to delegate to",
            },
            "message": {
                "type": "string",
                "description": "The task or question to send to the target agent",
            },
        },
        "required": ["agent_id", "message"],
    }

    # Maximum delegation chain depth. Depth is tracked via X-Delegation-Depth
    # header passed through the internal dispatch API. Prevents runaway
    # multi-agent recursion from consuming unbounded resources on the node.
    MAX_DEPTH = 3

    def __init__(
        self,
        api_url: str,
        internal_secret: str,
        caller_agent_id: str,
        user_id: str,
        delegation_depth: int = 0,
    ) -> None:
        self._api_url = api_url.rstrip("/")
        self._secret = internal_secret
        self._caller_agent_id = caller_agent_id
        self._user_id = user_id
        self._depth = delegation_depth

    async def execute(self, inputs: dict[str, Any]) -> str:
        import httpx

        agent_id = inputs["agent_id"]
        message = inputs["message"]

        # Guard against self-delegation
        if agent_id == self._caller_agent_id:
            return "Error: an agent cannot delegate to itself."

        # Guard against runaway delegation chains
        if self._depth >= self.MAX_DEPTH:
            return f"Error: maximum delegation depth ({self.MAX_DEPTH}) reached."

        async with httpx.AsyncClient(timeout=135) as client:
            resp = await client.post(
                f"{self._api_url}/internal/delegate",
                headers={
                    "Content-Type": "application/json",
                    "X-Internal-Secret": self._secret,
                    "X-Delegation-Depth": str(self._depth + 1),
                },
                json={
                    "agent_id": agent_id,
                    "message": message,
                    "caller_agent_id": self._caller_agent_id,
                    "user_id": self._user_id,
                    "delegation_depth": self._depth + 1,
                },
            )

        if resp.status_code != 200:
            return f"Delegation failed ({resp.status_code}): {resp.text[:500]}"

        data = resp.json()
        return data.get("output", "(no output)")


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
