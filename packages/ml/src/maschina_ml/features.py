"""Feature extraction from agent run telemetry for ML models."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass
class RunFeatures:
    """Numeric feature vector extracted from a single agent run."""
    run_id: str
    # Timing
    duration_secs: float
    turns: int
    # Token usage
    input_tokens: int
    output_tokens: int
    tokens_per_turn: float
    # Tool usage
    tool_calls: int
    tool_error_rate: float
    # Outcome
    success: bool
    tier: str  # kept for stratification, not used as ML input directly

    def to_array(self) -> np.ndarray:
        """Return a fixed-length float32 feature vector (exclude categorical fields)."""
        return np.array([
            self.duration_secs,
            float(self.turns),
            float(self.input_tokens),
            float(self.output_tokens),
            self.tokens_per_turn,
            float(self.tool_calls),
            self.tool_error_rate,
            float(self.success),
        ], dtype=np.float32)

    @property
    def feature_names(self) -> list[str]:
        return [
            "duration_secs",
            "turns",
            "input_tokens",
            "output_tokens",
            "tokens_per_turn",
            "tool_calls",
            "tool_error_rate",
            "success",
        ]


def extract_features(run: dict[str, Any]) -> RunFeatures:
    """
    Extract RunFeatures from a raw agent run record (as returned by the DB or API).

    Expected keys: run_id, duration_secs, turns, input_tokens, output_tokens,
                   tool_calls, tool_errors, status, tier
    """
    tool_calls = run.get("tool_calls", 0) or 0
    tool_errors = run.get("tool_errors", 0) or 0
    turns = run.get("turns", 1) or 1
    input_tokens = run.get("input_tokens", 0) or 0
    output_tokens = run.get("output_tokens", 0) or 0

    return RunFeatures(
        run_id=str(run["run_id"]),
        duration_secs=float(run.get("duration_secs", 0) or 0),
        turns=int(turns),
        input_tokens=int(input_tokens),
        output_tokens=int(output_tokens),
        tokens_per_turn=float(input_tokens + output_tokens) / float(turns),
        tool_calls=int(tool_calls),
        tool_error_rate=float(tool_errors) / float(tool_calls) if tool_calls > 0 else 0.0,
        success=run.get("status") == "completed",
        tier=str(run.get("tier", "access")),
    )


def batch_extract(runs: list[dict[str, Any]]) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """
    Extract features from a list of run records.

    Returns:
        X: (N, F) float32 feature matrix
        y: (N,) float32 labels (1.0 = success)
        run_ids: list of run_id strings
    """
    feats = [extract_features(r) for r in runs]
    X = np.stack([f.to_array() for f in feats], axis=0)
    y = np.array([float(f.success) for f in feats], dtype=np.float32)
    run_ids = [f.run_id for f in feats]
    return X, y, run_ids
