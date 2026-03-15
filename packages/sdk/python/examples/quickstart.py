"""
Maschina Python SDK — quickstart

Creates an analysis agent and runs it.

Prerequisites:
    pip install maschina-sdk
    export MASCHINA_API_KEY=msk_...
    python examples/quickstart.py
"""

import asyncio
import os

from maschina_sdk import MaschinaClient


async def main() -> None:
    async with MaschinaClient(api_key=os.environ["MASCHINA_API_KEY"]) as client:
        # Create an agent
        agent = await client.create_agent(
            {
                "name": "Research Assistant",
                "agent_type": "analysis",
                "model": "claude-sonnet-4-6",
                "system_prompt": (
                    "You are a concise research assistant. "
                    "Analyze topics and return structured, actionable summaries."
                ),
            }
        )
        print(f"Created agent: {agent.id}")

        # Run it
        run = await client.run_agent(
            agent.id,
            {
                "message": (
                    "What are the three most impactful use cases for autonomous AI agents in 2025?"
                ),
            },
        )
        print(f"Status: {run.status}")
        print("Output:", run.output_payload)

        # Clean up
        await client.delete_agent(agent.id)
        print("Done.")


asyncio.run(main())
