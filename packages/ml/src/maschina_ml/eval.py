"""Evaluation metrics for agent run quality and model performance."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class RunsetMetrics:
    """Aggregate metrics over a set of agent runs."""

    n: int
    success_rate: float
    avg_duration_secs: float
    avg_input_tokens: float
    avg_output_tokens: float
    avg_turns: float
    avg_tool_calls: float
    p50_duration: float
    p95_duration: float
    p50_tokens: float
    p95_tokens: float
    # Per-tier breakdown
    by_tier: dict[str, RunsetMetrics] = field(default_factory=dict)


def compute_metrics(runs: list[dict[str, Any]]) -> RunsetMetrics:
    """Compute aggregate metrics from a list of run records."""
    if not runs:
        return RunsetMetrics(
            n=0,
            success_rate=0.0,
            avg_duration_secs=0.0,
            avg_input_tokens=0.0,
            avg_output_tokens=0.0,
            avg_turns=0.0,
            avg_tool_calls=0.0,
            p50_duration=0.0,
            p95_duration=0.0,
            p50_tokens=0.0,
            p95_tokens=0.0,
        )

    successes = sum(1 for r in runs if r.get("status") == "completed")
    durations = np.array([float(r.get("duration_secs", 0) or 0) for r in runs])
    input_toks = np.array([float(r.get("input_tokens", 0) or 0) for r in runs])
    output_toks = np.array([float(r.get("output_tokens", 0) or 0) for r in runs])
    total_toks = input_toks + output_toks
    turns = np.array([float(r.get("turns", 0) or 0) for r in runs])
    tool_calls = np.array([float(r.get("tool_calls", 0) or 0) for r in runs])

    # Per-tier breakdown (recurse without breakdown to avoid infinite depth)
    tiers: dict[str, list[dict[str, Any]]] = {}
    for r in runs:
        t = str(r.get("tier", "unknown"))
        tiers.setdefault(t, []).append(r)
    by_tier = {
        tier: _compute_metrics_no_breakdown(tier_runs)
        for tier, tier_runs in tiers.items()
        if len(tiers) > 1  # only include breakdown if multiple tiers
    }

    return RunsetMetrics(
        n=len(runs),
        success_rate=successes / len(runs),
        avg_duration_secs=float(np.mean(durations)),
        avg_input_tokens=float(np.mean(input_toks)),
        avg_output_tokens=float(np.mean(output_toks)),
        avg_turns=float(np.mean(turns)),
        avg_tool_calls=float(np.mean(tool_calls)),
        p50_duration=float(np.percentile(durations, 50)),
        p95_duration=float(np.percentile(durations, 95)),
        p50_tokens=float(np.percentile(total_toks, 50)),
        p95_tokens=float(np.percentile(total_toks, 95)),
        by_tier=by_tier,
    )


def _compute_metrics_no_breakdown(runs: list[dict[str, Any]]) -> RunsetMetrics:
    m = compute_metrics(runs)
    m.by_tier = {}
    return m


def classification_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    """
    Binary classification metrics for a success/failure predictor.

    Args:
        y_true: ground truth (0/1)
        y_pred: predicted probabilities or hard labels
    """
    from sklearn.metrics import (
        accuracy_score,
        f1_score,
        precision_score,
        recall_score,
        roc_auc_score,
    )

    hard = (y_pred >= 0.5).astype(int)
    metrics: dict[str, float] = {
        "accuracy": float(accuracy_score(y_true, hard)),
        "precision": float(precision_score(y_true, hard, zero_division=0)),
        "recall": float(recall_score(y_true, hard, zero_division=0)),
        "f1": float(f1_score(y_true, hard, zero_division=0)),
    }
    if len(np.unique(y_true)) > 1:
        metrics["roc_auc"] = float(roc_auc_score(y_true, y_pred))
    return metrics
