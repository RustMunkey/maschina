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


async def _fetch_agent_config(conn: asyncpg.Connection, agent_id: str) -> dict[str, Any]:
    """Fetch agent row + enabled skills from the DB."""
    row = await conn.fetchrow(
        "SELECT config, type, name FROM agents WHERE id = $1 AND deleted_at IS NULL",
        agent_id,
    )
    if not row:
        return {}

    cfg = json.loads(row["config"]) if isinstance(row["config"], str) else (row["config"] or {})

    # Fall back to a default system prompt if the agent config doesn't have one
    if not cfg.get("systemPrompt"):
        cfg["systemPrompt"] = (
            f'You are a Maschina {row["type"]} agent named "{row["name"]}". '
            "Complete the task provided."
        )

    # Fetch enabled skills
    skill_rows = await conn.fetch(
        "SELECT skill_name, config FROM agent_skills WHERE agent_id = $1 AND enabled = true",
        agent_id,
    )
    cfg["skills"] = [r["skill_name"] for r in skill_rows]
    cfg["skillConfigs"] = {
        r["skill_name"]: (
            json.loads(r["config"]) if isinstance(r["config"], str) else (r["config"] or {})
        )
        for r in skill_rows
    }

    return cfg


async def _fetch_plan_tier(conn: asyncpg.Connection, user_id: str) -> str:
    """Return the user's current plan tier (falls back to 'access')."""
    row = await conn.fetchrow(
        "SELECT tier FROM subscriptions WHERE user_id = $1 AND status = 'active' LIMIT 1",
        user_id,
    )
    return str(row["tier"]) if row else "access"


@activity.defn
async def run_agent_step(params: dict[str, Any]) -> dict[str, Any]:
    """
    Execute one agent step via the runtime service.

    params:
      step     — step definition (id, agentId, prompt, config)
      run_id   — workflow_runs.id (used for logging context)
      user_id  — owner user id
      context  — { input: dict, step_outputs: { step_id: dict } }
    """
    import uuid

    step: dict[str, Any] = params["step"]
    wf_run_id: str = params["run_id"]
    user_id: str = params.get("user_id", "")
    context: dict[str, Any] = params.get("context", {})

    agent_id: str = step.get("agent_id") or step.get("agentId") or ""
    if not agent_id:
        raise ValueError(f"Step {step.get('id')} has no agentId")

    # Template-substitute prompt: {{input.key}} and {{step_id.out_key}}
    prompt: str = step.get("prompt", "")
    for k, v in (context.get("input") or {}).items():
        prompt = prompt.replace(f"{{{{input.{k}}}}}", str(v))
    for sid, out in (context.get("step_outputs") or {}).items():
        if isinstance(out, dict):
            for ok, ov in out.items():
                prompt = prompt.replace(f"{{{{{sid}.{ok}}}}}", str(ov))

    log.info(
        "workflow.activity.run_agent_step",
        wf_run_id=wf_run_id,
        step_id=step.get("id"),
        agent_id=agent_id,
    )

    conn = await _get_conn()
    try:
        agent_cfg = await _fetch_agent_config(conn, agent_id)
        plan_tier = await _fetch_plan_tier(conn, user_id)
    finally:
        await conn.close()

    # Step-level config overrides agent defaults
    step_cfg: dict[str, Any] = step.get("config") or {}
    model: str = step_cfg.get("model") or agent_cfg.get("model") or "claude-haiku-4-5-20251001"
    system_prompt: str = (
        step_cfg.get("system_prompt")
        or step_cfg.get("systemPrompt")
        or agent_cfg.get("systemPrompt", "")
    )
    skills: list[str] = step_cfg.get("skills") or agent_cfg.get("skills") or []
    skill_configs: dict[str, Any] = (
        step_cfg.get("skill_configs")
        or step_cfg.get("skillConfigs")
        or agent_cfg.get("skillConfigs")
        or {}
    )
    timeout_secs: int = int(step_cfg.get("timeout_secs", 300))

    # Each activity invocation gets its own run_id so the runtime can trace it
    step_run_id = str(uuid.uuid4())

    async with httpx.AsyncClient(timeout=float(timeout_secs + 30)) as client:
        resp = await client.post(
            f"{settings.runtime_url}/run",
            json={
                "run_id": step_run_id,
                "agent_id": agent_id,
                "user_id": user_id,
                "plan_tier": plan_tier,
                "model": model,
                "system_prompt": system_prompt,
                "max_tokens": int(step_cfg.get("max_tokens", 4096)),
                "input_payload": {"message": prompt},
                "timeout_secs": timeout_secs,
                "skills": skills,
                "skill_configs": skill_configs,
            },
        )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()

    # Normalise: surface output_payload.text as a top-level "output" key
    output_payload: dict[str, Any] = data.get("output_payload") or {}
    return {
        "step_id": step.get("id"),
        "step_run_id": step_run_id,
        "output": output_payload.get("text", ""),
        "output_payload": output_payload,
        "input_tokens": data.get("input_tokens", 0),
        "output_tokens": data.get("output_tokens", 0),
    }


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
