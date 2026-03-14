# Maschina Python SDK

Official Python SDK for the [Maschina](https://maschina.ai) API — infrastructure for autonomous digital labor.

[![PyPI](https://img.shields.io/pypi/v/maschina-sdk)](https://pypi.org/project/maschina-sdk/)
[![CI](https://github.com/maschina-labs/sdk-python/actions/workflows/ci.yml/badge.svg)](https://github.com/maschina-labs/sdk-python/actions/workflows/ci.yml)
[![Python](https://img.shields.io/pypi/pyversions/maschina-sdk)](https://pypi.org/project/maschina-sdk/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

## Installation

```bash
pip install maschina-sdk
```

## Quick start

```python
import asyncio
import os
from maschina_sdk import MaschinaClient

async def main():
    async with MaschinaClient(api_key=os.environ["MASCHINA_API_KEY"]) as client:
        # Create an agent
        agent = await client.create_agent({
            "name": "Research Assistant",
            "agent_type": "analysis",
            "model": "claude-sonnet-4-6",
            "system_prompt": "You are a thorough research assistant. Return structured findings.",
        })

        # Run it
        run = await client.run_agent(agent.id, {
            "message": "Research the latest advances in autonomous AI agents.",
        })

        print(run.output_payload)

asyncio.run(main())
```

## Authentication

Get your API key from [app.maschina.ai/keys](https://app.maschina.ai/keys).

```python
from maschina_sdk import MaschinaClient

# As a context manager (recommended)
async with MaschinaClient(
    api_key="msk_...",
    base_url="https://api.maschina.ai",  # optional
    timeout=30.0,                         # optional, seconds
) as client:
    ...

# Or manage lifecycle manually
client = MaschinaClient(api_key="msk_...")
# ... use client ...
await client.close()
```

## API Reference

### Agents

```python
# List agents
agents = await client.list_agents()

# Get a single agent
agent = await client.get_agent("agent-id")

# Create
agent = await client.create_agent({
    "name": "My Agent",
    "agent_type": "execution",  # signal | analysis | execution | optimization | reporting
    "model": "claude-sonnet-4-6",
    "system_prompt": "You are...",
    "config": {"temperature": 0.7},
})

# Update
agent = await client.update_agent("agent-id", {
    "name": "New name",
    "system_prompt": "Updated prompt",
})

# Delete
await client.delete_agent("agent-id")
```

### Running agents

```python
# Trigger a run
run = await client.run_agent("agent-id", {
    "message": "Your task here",
    "context": {"key": "value"},
})

print(run.status)         # queued | executing | completed | failed | timeout | canceled
print(run.output_payload) # dict with the agent's output
print(run.input_tokens)   # tokens used

# List recent runs
runs = await client.list_agent_runs("agent-id")
```

### API Keys

```python
# List keys
keys = await client.list_keys()

# Create (raw key returned only once)
response = await client.create_key({
    "name": "My key",
    "expires_at": "2027-01-01T00:00:00Z",  # optional
})
print(response.key)  # save immediately

# Revoke
await client.revoke_key("key-id")
```

### Billing & Usage

```python
usage = await client.get_usage()
print(usage.tier)  # "m5"
print(usage.quotas["monthly_model_tokens"])
# {"used": 1200000, "limit": 5000000}

subscription = await client.get_subscription()
print(subscription.status)  # "active"
```

## Agent types

| Type | Purpose |
|------|---------|
| `signal` | Market or event signal detection |
| `analysis` | Deep analysis and research |
| `execution` | Task execution and automation |
| `optimization` | Continuous improvement loops |
| `reporting` | Structured report generation |

## Models

| Model | Tier required |
|-------|--------------|
| `claude-haiku-4-5` | M1+ |
| `claude-sonnet-4-6` | M5+ |
| `claude-opus-4-6` | M10+ |
| `gpt-4o` | M5+ |
| `gpt-4o-mini` | M1+ |
| `ollama/<model>` | Any (self-hosted nodes) |

## Error handling

```python
from maschina_sdk import MaschinaClient, MaschinaError

try:
    agent = await client.get_agent("nonexistent")
except MaschinaError as e:
    print(e.status)   # 404
    print(e.message)  # "Agent not found"
    print(e.code)     # "not_found"
```

## Type safety

All inputs and responses are validated with Pydantic models:

```python
from maschina_sdk import Agent, AgentRun, CreateAgentInput, UsageSummary

# Input validation
input_data = CreateAgentInput(
    name="My Agent",
    agent_type="analysis",
    model="claude-sonnet-4-6",
)

# Response types
agent: Agent = await client.get_agent("id")
run: AgentRun = await client.run_agent("id", {"message": "..."})
```

## Examples

See [`examples/`](examples/) for runnable code:

- [`quickstart.py`](examples/quickstart.py) — create and run in 15 lines
- [`poll_until_done.py`](examples/poll_until_done.py) — poll for run completion
- [`research_agent.py`](examples/research_agent.py) — full research agent pattern

## Requirements

- Python 3.12+
- httpx, pydantic (installed automatically)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0 © [Maschina Labs](https://github.com/maschina-labs)
