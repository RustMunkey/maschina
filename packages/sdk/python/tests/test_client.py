"""Tests for the Maschina Python SDK client."""

import httpx
import pytest
import respx
from maschina_sdk import MaschinaClient, MaschinaError
from maschina_sdk.types import Agent, AgentRun, AgentStatus, AgentType, RunStatus

BASE_URL = "https://api.example.com"

AGENT_DATA = {
    "id": "00000000-0000-0000-0000-000000000001",
    "name": "Test Agent",
    "description": None,
    "agent_type": "execution",
    "model": "claude-sonnet-4-6",
    "system_prompt": "You are a test agent.",
    "status": "idle",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
}

RUN_DATA = {
    "id": "00000000-0000-0000-0000-000000000002",
    "agent_id": "00000000-0000-0000-0000-000000000001",
    "status": "queued",
    "input_payload": {"message": "hello"},
    "output_payload": None,
    "input_tokens": None,
    "output_tokens": None,
    "duration_ms": None,
    "error_code": None,
    "error_message": None,
    "started_at": None,
    "finished_at": None,
    "created_at": "2026-01-01T00:00:00Z",
}


@pytest.fixture
def client():
    return MaschinaClient(api_key="msk_test_key", base_url=BASE_URL)


# ── Agents ────────────────────────────────────────────────────────────────────


@respx.mock
@pytest.mark.asyncio
async def test_list_agents(client):
    respx.get(f"{BASE_URL}/agents").mock(return_value=httpx.Response(200, json=[AGENT_DATA]))
    agents = await client.list_agents()
    assert len(agents) == 1
    assert isinstance(agents[0], Agent)
    assert agents[0].name == "Test Agent"


@respx.mock
@pytest.mark.asyncio
async def test_get_agent(client):
    respx.get(f"{BASE_URL}/agents/00000000-0000-0000-0000-000000000001").mock(
        return_value=httpx.Response(200, json=AGENT_DATA)
    )
    agent = await client.get_agent("00000000-0000-0000-0000-000000000001")
    assert agent.agent_type == AgentType.execution
    assert agent.status == AgentStatus.idle


@respx.mock
@pytest.mark.asyncio
async def test_create_agent(client):
    respx.post(f"{BASE_URL}/agents").mock(return_value=httpx.Response(200, json=AGENT_DATA))
    from maschina_sdk.types import CreateAgentInput

    inp = CreateAgentInput(name="Test Agent", agent_type=AgentType.execution)
    agent = await client.create_agent(inp)
    assert isinstance(agent, Agent)


@respx.mock
@pytest.mark.asyncio
async def test_delete_agent(client):
    respx.delete(f"{BASE_URL}/agents/00000000-0000-0000-0000-000000000001").mock(
        return_value=httpx.Response(204)
    )
    result = await client.delete_agent("00000000-0000-0000-0000-000000000001")
    assert result is None


@respx.mock
@pytest.mark.asyncio
async def test_run_agent(client):
    respx.post(f"{BASE_URL}/agents/00000000-0000-0000-0000-000000000001/run").mock(
        return_value=httpx.Response(200, json=RUN_DATA)
    )
    from maschina_sdk.types import RunAgentInput

    run = await client.run_agent(
        "00000000-0000-0000-0000-000000000001", RunAgentInput(message="hello")
    )
    assert isinstance(run, AgentRun)
    assert run.status == RunStatus.queued


# ── API Keys ──────────────────────────────────────────────────────────────────


@respx.mock
@pytest.mark.asyncio
async def test_create_key(client):
    key_data = {
        "id": "00000000-0000-0000-0000-000000000003",
        "name": "my key",
        "key_prefix": "msk_live_xxxx",
        "created_at": "2026-01-01T00:00:00Z",
        "last_used_at": None,
        "expires_at": None,
        "key": "msk_live_xxxxxxxxxxxx",
    }
    respx.post(f"{BASE_URL}/keys").mock(return_value=httpx.Response(200, json=key_data))
    from maschina_sdk.types import CreateKeyInput

    result = await client.create_key(CreateKeyInput(name="my key"))
    assert result.key == "msk_live_xxxxxxxxxxxx"


# ── Errors ────────────────────────────────────────────────────────────────────


@respx.mock
@pytest.mark.asyncio
async def test_raises_maschina_error_on_401(client):
    respx.get(f"{BASE_URL}/agents").mock(
        return_value=httpx.Response(
            401, json={"error": {"message": "Invalid API key", "code": "unauthorized"}}
        )
    )
    with pytest.raises(MaschinaError) as exc:
        await client.list_agents()
    assert exc.value.status == 401
    assert exc.value.code == "unauthorized"


@respx.mock
@pytest.mark.asyncio
async def test_raises_maschina_error_on_429(client):
    respx.get(f"{BASE_URL}/agents").mock(
        return_value=httpx.Response(
            429, json={"error": {"message": "Rate limit exceeded", "code": "rate_limited"}}
        )
    )
    with pytest.raises(MaschinaError) as exc:
        await client.list_agents()
    assert exc.value.status == 429


# ── Auth header ───────────────────────────────────────────────────────────────


@respx.mock
@pytest.mark.asyncio
async def test_sends_auth_header(client):
    route = respx.get(f"{BASE_URL}/agents").mock(return_value=httpx.Response(200, json=[]))
    await client.list_agents()
    assert route.called
    request = route.calls[0].request
    assert request.headers["authorization"] == "Bearer msk_test_key"
