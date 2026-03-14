"""Temporal workflow definitions for multi-agent pipelines."""

from __future__ import annotations

import asyncio
from datetime import timedelta
from typing import Any

import structlog
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from .activities import run_agent_step, update_run_status

log = structlog.get_logger()

_RETRY = RetryPolicy(maximum_attempts=3, initial_interval=timedelta(seconds=5))
_STEP_TIMEOUT = timedelta(minutes=10)
_UPDATE_TIMEOUT = timedelta(seconds=30)


def _activity(fn: Any, params: dict[str, Any]) -> Any:
    return workflow.execute_activity(
        fn, params, start_to_close_timeout=_STEP_TIMEOUT, retry_policy=_RETRY
    )


def _update(params: dict[str, Any]) -> Any:
    return workflow.execute_activity(
        update_run_status, params, start_to_close_timeout=_UPDATE_TIMEOUT, retry_policy=_RETRY
    )


@workflow.defn
class AgentWorkflow:
    """
    Durable multi-agent workflow supporting three execution strategies:

    - sequential  : steps run in order; each step receives previous step's output
    - parallel    : all steps run concurrently; outputs collected into a dict
    - conditional : steps form a DAG; branching driven by on_true / on_false pointers
    """

    @workflow.run
    async def run(self, params: dict[str, Any]) -> dict[str, Any]:
        run_id: str = params["run_id"]
        user_id: str = params["user_id"]
        workflow_type: str = params["workflow_type"]
        steps: list[dict[str, Any]] = params["steps"]
        input_data: dict[str, Any] = params.get("input", {})

        wf_info = workflow.info()
        await _update(
            {
                "run_id": run_id,
                "status": "running",
                "temporal_workflow_id": wf_info.workflow_id,
                "temporal_run_id": wf_info.run_id,
            }
        )

        try:
            if workflow_type == "sequential":
                result = await self._sequential(steps, run_id, user_id, input_data)
            elif workflow_type == "parallel":
                result = await self._parallel(steps, run_id, user_id, input_data)
            elif workflow_type == "conditional":
                result = await self._conditional(steps, run_id, user_id, input_data)
            else:
                raise ValueError(f"Unknown workflow_type: {workflow_type}")

            await _update({"run_id": run_id, "status": "completed", "output": result})
            return result

        except Exception as exc:
            await _update({"run_id": run_id, "status": "failed", "error": str(exc)})
            raise

    # ── Sequential ─────────────────────────────────────────────────────────────

    async def _sequential(
        self,
        steps: list[dict[str, Any]],
        run_id: str,
        user_id: str,
        input_data: dict[str, Any],
    ) -> dict[str, Any]:
        step_outputs: dict[str, Any] = {}
        last_output: dict[str, Any] = {}

        for step in steps:
            output = await _activity(
                run_agent_step,
                {
                    "step": step,
                    "run_id": run_id,
                    "user_id": user_id,
                    "context": {"input": input_data, "step_outputs": step_outputs},
                },
            )
            step_outputs[step["id"]] = output
            last_output = output

        return {"step_outputs": step_outputs, "output": last_output}

    # ── Parallel ───────────────────────────────────────────────────────────────

    async def _parallel(
        self,
        steps: list[dict[str, Any]],
        run_id: str,
        user_id: str,
        input_data: dict[str, Any],
    ) -> dict[str, Any]:
        tasks = [
            _activity(
                run_agent_step,
                {
                    "step": step,
                    "run_id": run_id,
                    "user_id": user_id,
                    "context": {"input": input_data, "step_outputs": {}},
                },
            )
            for step in steps
        ]
        outputs = await asyncio.gather(*tasks)
        return {"step_outputs": {s["id"]: o for s, o in zip(steps, outputs)}}

    # ── Conditional ────────────────────────────────────────────────────────────

    async def _conditional(
        self,
        steps: list[dict[str, Any]],
        run_id: str,
        user_id: str,
        input_data: dict[str, Any],
    ) -> dict[str, Any]:
        step_map = {s["id"]: s for s in steps}
        step_outputs: dict[str, Any] = {}

        # Start from the first step
        current_id: str | None = steps[0]["id"] if steps else None

        while current_id and current_id in step_map:
            step = step_map[current_id]

            if step.get("type") == "condition":
                # Evaluate condition against previous outputs
                condition_field: str = step.get("condition_field", "")
                prev_output = step_outputs.get(step.get("depends_on", ""), {})
                is_truthy = (
                    bool(prev_output.get(condition_field)) if condition_field else bool(prev_output)
                )
                current_id = step.get("on_true") if is_truthy else step.get("on_false")
                continue

            output = await _activity(
                run_agent_step,
                {
                    "step": step,
                    "run_id": run_id,
                    "user_id": user_id,
                    "context": {"input": input_data, "step_outputs": step_outputs},
                },
            )
            step_outputs[step["id"]] = output
            current_id = step.get("on_success")

        return {
            "step_outputs": step_outputs,
            "output": step_outputs.get(list(step_outputs)[-1]) if step_outputs else {},
        }
