"""Temporal activities — the side-effectful building blocks of workflows."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import asyncpg
import httpx
import structlog
from temporalio import activity

from ..config import settings

log = structlog.get_logger()


async def _get_conn() -> asyncpg.Connection:
    return await asyncpg.connect(settings.database_url)


@activity.defn
async def run_agent_step(params: dict[str, Any]) -> dict[str, Any]:
    """
    Execute one agent step via the runtime service.

    params:
      step     — step definition (id, name, agentId, prompt, config)
      run_id   — workflow_runs.id
      user_id  — owner user id
      context  — { input: dict, step_outputs: { step_id: dict } }
    """
    step: dict[str, Any] = params["step"]
    run_id: str = params["run_id"]
    user_id: str = params.get("user_id", "")
    context: dict[str, Any] = params.get("context", {})

    agent_id = step.get("agent_id") or step.get("agentId")
    prompt: str = step.get("prompt", "")

    # Simple template substitution: {{input.key}} and {{step_id.out_key}}
    for k, v in (context.get("input") or {}).items():
        prompt = prompt.replace(f"{{{{input.{k}}}}}", str(v))
    for sid, out in (context.get("step_outputs") or {}).items():
        if isinstance(out, dict):
            for ok, ov in out.items():
                prompt = prompt.replace(f"{{{{{sid}.{ok}}}}}", str(ov))

    log.info("workflow.activity.run_agent_step", run_id=run_id, step_id=step.get("id"))

    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(
            f"{settings.runtime_url}/run",
            json={
                "agent_id": agent_id,
                "user_id": user_id,
                "prompt": prompt,
                "model": step.get("config", {}).get("model"),
                "system_prompt": step.get("config", {}).get("system_prompt"),
                "skills": step.get("config", {}).get("skills", []),
                "skill_configs": step.get("config", {}).get("skill_configs", {}),
            },
        )
        resp.raise_for_status()
        return resp.json()  # type: ignore[no-any-return]


@activity.defn
async def update_run_status(params: dict[str, Any]) -> None:
    """Update workflow_runs in the DB."""
    run_id: str = params["run_id"]
    status: str = params["status"]
    output: dict[str, Any] | None = params.get("output")
    error: str | None = params.get("error")
    now = datetime.now(UTC)

    conn = await _get_conn()
    try:
        if status == "running":
            temporal_wf_id: str | None = params.get("temporal_workflow_id")
            temporal_run_id: str | None = params.get("temporal_run_id")
            await conn.execute(
                """
                UPDATE workflow_runs
                SET status = $1, started_at = $2,
                    temporal_workflow_id = $3, temporal_run_id = $4
                WHERE id = $5
                """,
                status,
                now,
                temporal_wf_id,
                temporal_run_id,
                run_id,
            )
        else:
            await conn.execute(
                """
                UPDATE workflow_runs
                SET status = $1, output = $2::jsonb, error = $3, completed_at = $4
                WHERE id = $5
                """,
                status,
                json.dumps(output) if output is not None else None,
                error,
                now,
                run_id,
            )
    except Exception as exc:
        log.error("workflow.activity.update_run_status.error", run_id=run_id, error=str(exc))
    finally:
        await conn.close()
