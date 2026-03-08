"""Reinforcement learning reward computation for agent run outcomes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class RewardSignal:
    run_id: str
    reward: float        # total scalar reward
    # Components (for logging / debugging)
    outcome_reward: float
    efficiency_reward: float
    cost_penalty: float
    latency_penalty: float


# Weights — tune via Optuna or manual experiments
OUTCOME_WEIGHT = 1.0
EFFICIENCY_WEIGHT = 0.3
COST_WEIGHT = 0.2
LATENCY_WEIGHT = 0.1

# Baselines (rough p50 values — updated from data over time)
BASELINE_TOKENS = 2_000
BASELINE_DURATION_SECS = 30.0
COST_PER_TOKEN = 0.000_003  # $3 per 1M tokens (rough blended rate)
COST_BUDGET = 0.01           # $0.01 per run budget


def compute_reward(run: dict[str, Any]) -> RewardSignal:
    """
    Compute a scalar reward for a completed agent run.

    Higher = better. Used to train the RL agent selector and
    prompt optimization loops.
    """
    run_id = str(run["run_id"])
    status = run.get("status", "failed")
    input_tokens = int(run.get("input_tokens", 0) or 0)
    output_tokens = int(run.get("output_tokens", 0) or 0)
    duration_secs = float(run.get("duration_secs", 0) or 0)
    total_tokens = input_tokens + output_tokens

    # 1. Outcome: +1 for success, -1 for failure, 0 for timeout
    if status == "completed":
        outcome_reward = 1.0
    elif status == "timeout":
        outcome_reward = -0.5
    else:
        outcome_reward = -1.0

    # 2. Token efficiency: reward if below baseline, penalize if above
    if total_tokens > 0:
        ratio = BASELINE_TOKENS / total_tokens
        efficiency_reward = float(min(ratio, 2.0) - 1.0)  # range ~[-1, 1]
    else:
        efficiency_reward = 0.0

    # 3. Cost penalty: 0 if within budget, linear penalty above
    estimated_cost = total_tokens * COST_PER_TOKEN
    cost_penalty = min(max(estimated_cost - COST_BUDGET, 0.0) / COST_BUDGET, 1.0)

    # 4. Latency penalty: 0 if within baseline, linear above
    latency_penalty = min(max(duration_secs - BASELINE_DURATION_SECS, 0.0) / BASELINE_DURATION_SECS, 1.0)

    reward = (
        OUTCOME_WEIGHT * outcome_reward
        + EFFICIENCY_WEIGHT * efficiency_reward
        - COST_WEIGHT * cost_penalty
        - LATENCY_WEIGHT * latency_penalty
    )

    return RewardSignal(
        run_id=run_id,
        reward=reward,
        outcome_reward=outcome_reward,
        efficiency_reward=efficiency_reward,
        cost_penalty=cost_penalty,
        latency_penalty=latency_penalty,
    )


def batch_rewards(runs: list[dict[str, Any]]) -> list[RewardSignal]:
    return [compute_reward(r) for r in runs]
