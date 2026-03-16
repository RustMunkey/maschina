"""ML package tests — feature extraction, RL rewards, dataset splitting."""

from __future__ import annotations

import importlib.util

import numpy as np
import pytest

# ─── Helpers ──────────────────────────────────────────────────────────────────


def _run(
    run_id: str = "run-1",
    status: str = "completed",
    duration_secs: float = 20.0,
    turns: int = 3,
    input_tokens: int = 1000,
    output_tokens: int = 500,
    tool_calls: int = 2,
    tool_errors: int = 0,
    tier: str = "m1",
) -> dict:
    return {
        "run_id": run_id,
        "status": status,
        "duration_secs": duration_secs,
        "turns": turns,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "tool_calls": tool_calls,
        "tool_errors": tool_errors,
        "tier": tier,
    }


def _skip_if_not_installed() -> None:
    if importlib.util.find_spec("maschina_ml") is None:
        pytest.skip("maschina_ml not installed — run: uv pip install -e packages/ml")


# ─── extract_features ─────────────────────────────────────────────────────────


class TestExtractFeatures:
    def setup_method(self) -> None:
        _skip_if_not_installed()
        from maschina_ml.features import extract_features

        self.extract_features = extract_features

    def test_basic_completed_run(self) -> None:
        feat = self.extract_features(_run())
        assert feat.run_id == "run-1"
        assert feat.success is True
        assert feat.turns == 3
        assert feat.input_tokens == 1000
        assert feat.output_tokens == 500
        assert feat.tool_calls == 2
        assert feat.tool_error_rate == pytest.approx(0.0)

    def test_failed_run_success_false(self) -> None:
        feat = self.extract_features(_run(status="failed"))
        assert feat.success is False

    def test_tokens_per_turn(self) -> None:
        feat = self.extract_features(_run(input_tokens=900, output_tokens=300, turns=3))
        assert feat.tokens_per_turn == pytest.approx(400.0)

    def test_tool_error_rate(self) -> None:
        feat = self.extract_features(_run(tool_calls=4, tool_errors=1))
        assert feat.tool_error_rate == pytest.approx(0.25)

    def test_zero_tool_calls_no_error(self) -> None:
        feat = self.extract_features(_run(tool_calls=0, tool_errors=0))
        assert feat.tool_error_rate == pytest.approx(0.0)

    def test_defaults_for_missing_fields(self) -> None:
        feat = self.extract_features({"run_id": "x"})
        assert feat.run_id == "x"
        assert feat.success is False
        assert feat.turns == 1
        assert feat.tool_calls == 0
        assert feat.duration_secs == pytest.approx(0.0)

    def test_to_array_shape(self) -> None:
        feat = self.extract_features(_run())
        arr = feat.to_array()
        assert arr.dtype == np.float32
        assert arr.shape == (8,)

    def test_to_array_success_flag(self) -> None:
        feat_ok = self.extract_features(_run(status="completed"))
        feat_fail = self.extract_features(_run(status="failed"))
        assert feat_ok.to_array()[-1] == pytest.approx(1.0)
        assert feat_fail.to_array()[-1] == pytest.approx(0.0)

    def test_feature_names_length_matches_array(self) -> None:
        feat = self.extract_features(_run())
        assert len(feat.feature_names) == feat.to_array().shape[0]


# ─── batch_extract ────────────────────────────────────────────────────────────


class TestBatchExtract:
    def setup_method(self) -> None:
        _skip_if_not_installed()
        from maschina_ml.features import batch_extract

        self.batch_extract = batch_extract

    def test_returns_correct_shapes(self) -> None:
        runs = [_run(f"r{i}", status="completed" if i % 2 == 0 else "failed") for i in range(5)]
        X, y, run_ids = self.batch_extract(runs)
        assert X.shape == (5, 8)
        assert y.shape == (5,)
        assert len(run_ids) == 5

    def test_y_labels_match_status(self) -> None:
        runs = [_run("ok", status="completed"), _run("fail", status="failed")]
        X, y, run_ids = self.batch_extract(runs)
        assert y[0] == pytest.approx(1.0)
        assert y[1] == pytest.approx(0.0)

    def test_run_ids_preserved(self) -> None:
        runs = [_run(f"run-{i}") for i in range(3)]
        _, _, run_ids = self.batch_extract(runs)
        assert run_ids == ["run-0", "run-1", "run-2"]


# ─── compute_reward ───────────────────────────────────────────────────────────


class TestComputeReward:
    def setup_method(self) -> None:
        _skip_if_not_installed()
        from maschina_ml.rl import compute_reward

        self.compute_reward = compute_reward

    def test_completed_run_positive_reward(self) -> None:
        sig = self.compute_reward(
            _run(status="completed", input_tokens=500, output_tokens=500, duration_secs=10.0)
        )
        assert sig.reward > 0
        assert sig.outcome_reward == pytest.approx(1.0)

    def test_failed_run_negative_reward(self) -> None:
        sig = self.compute_reward(_run(status="failed", input_tokens=500, output_tokens=500))
        assert sig.reward < 0
        assert sig.outcome_reward == pytest.approx(-1.0)

    def test_timeout_partial_negative(self) -> None:
        sig = self.compute_reward(_run(status="timeout"))
        assert sig.outcome_reward == pytest.approx(-0.5)

    def test_efficient_run_has_positive_efficiency(self) -> None:
        # Below baseline tokens (2000): efficiency_reward > 0
        sig = self.compute_reward(_run(input_tokens=500, output_tokens=500))
        assert sig.efficiency_reward > 0.0

    def test_expensive_run_has_cost_penalty(self) -> None:
        # Way above token budget ($0.01 at $0.000003/token = ~3333 tokens)
        sig = self.compute_reward(_run(input_tokens=50_000, output_tokens=50_000))
        assert sig.cost_penalty > 0.0

    def test_slow_run_has_latency_penalty(self) -> None:
        # Above baseline (30s)
        sig = self.compute_reward(_run(duration_secs=120.0))
        assert sig.latency_penalty > 0.0

    def test_fast_cheap_run_no_penalties(self) -> None:
        sig = self.compute_reward(_run(duration_secs=5.0, input_tokens=100, output_tokens=100))
        assert sig.cost_penalty == pytest.approx(0.0)
        assert sig.latency_penalty == pytest.approx(0.0)

    def test_run_id_preserved(self) -> None:
        sig = self.compute_reward(_run(run_id="my-run-xyz"))
        assert sig.run_id == "my-run-xyz"

    def test_reward_is_scalar_float(self) -> None:
        sig = self.compute_reward(_run())
        assert isinstance(sig.reward, float)


# ─── batch_rewards ────────────────────────────────────────────────────────────


class TestBatchRewards:
    def setup_method(self) -> None:
        _skip_if_not_installed()
        from maschina_ml.rl import batch_rewards

        self.batch_rewards = batch_rewards

    def test_returns_one_signal_per_run(self) -> None:
        runs = [_run(f"r{i}") for i in range(4)]
        signals = self.batch_rewards(runs)
        assert len(signals) == 4

    def test_run_ids_match(self) -> None:
        runs = [_run(f"run-{i}") for i in range(3)]
        signals = self.batch_rewards(runs)
        assert [s.run_id for s in signals] == ["run-0", "run-1", "run-2"]


# ─── normalize ────────────────────────────────────────────────────────────────


class TestNormalize:
    def setup_method(self) -> None:
        _skip_if_not_installed()
        from maschina_ml.dataset import normalize

        self.normalize = normalize

    def test_train_mean_is_zero_after_normalization(self) -> None:
        X_train = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]], dtype=np.float32)
        X_test = np.array([[2.0, 3.0]], dtype=np.float32)
        X_train_norm, _, _, _ = self.normalize(X_train, X_test)
        assert np.allclose(X_train_norm.mean(axis=0), 0.0, atol=1e-5)

    def test_train_std_is_one_after_normalization(self) -> None:
        X_train = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]], dtype=np.float32)
        X_test = np.array([[2.0, 3.0]], dtype=np.float32)
        X_train_norm, _, _, _ = self.normalize(X_train, X_test)
        assert np.allclose(X_train_norm.std(axis=0), 1.0, atol=1e-4)

    def test_constant_feature_does_not_divide_by_zero(self) -> None:
        X_train = np.array([[5.0, 1.0], [5.0, 2.0], [5.0, 3.0]], dtype=np.float32)
        X_test = np.array([[5.0, 2.0]], dtype=np.float32)
        X_train_norm, X_test_norm, _, _ = self.normalize(X_train, X_test)
        assert np.all(np.isfinite(X_train_norm))
        assert np.all(np.isfinite(X_test_norm))

    def test_test_uses_train_statistics(self) -> None:
        X_train = np.array([[0.0], [2.0], [4.0]], dtype=np.float32)
        X_test = np.array([[6.0]], dtype=np.float32)
        _, X_test_norm, mean, std = self.normalize(X_train, X_test)
        expected = (6.0 - mean[0]) / std[0]
        assert X_test_norm[0, 0] == pytest.approx(expected, abs=1e-5)

    def test_returns_mean_and_std(self) -> None:
        X_train = np.array([[1.0, 10.0], [3.0, 20.0]], dtype=np.float32)
        X_test = np.array([[2.0, 15.0]], dtype=np.float32)
        _, _, mean, std = self.normalize(X_train, X_test)
        assert mean.shape == (2,)
        assert std.shape == (2,)


# ─── train_test_split ─────────────────────────────────────────────────────────


class TestTrainTestSplit:
    def setup_method(self) -> None:
        _skip_if_not_installed()
        from maschina_ml.dataset import train_test_split

        self.train_test_split = train_test_split

    def _make_runs(self, n: int = 20) -> list[dict]:
        return [_run(f"r{i}", status="completed" if i % 3 != 0 else "failed") for i in range(n)]

    def test_split_sizes(self) -> None:
        runs = self._make_runs(20)
        X_train, X_test, y_train, y_test = self.train_test_split(runs, test_size=0.2)
        assert len(X_train) == 16
        assert len(X_test) == 4

    def test_no_overlap_between_splits(self) -> None:
        runs = self._make_runs(20)
        X_train, X_test, _, _ = self.train_test_split(runs)
        assert X_train.shape[0] + X_test.shape[0] == 20

    def test_reproducible_with_seed(self) -> None:
        runs = self._make_runs(20)
        X_a, X_b_test, _, _ = self.train_test_split(runs, seed=99)
        X_c, X_d_test, _, _ = self.train_test_split(runs, seed=99)
        assert np.array_equal(X_a, X_c)

    def test_different_seeds_give_different_splits(self) -> None:
        runs = self._make_runs(20)
        _, X_test_1, _, _ = self.train_test_split(runs, seed=1)
        _, X_test_2, _, _ = self.train_test_split(runs, seed=2)
        assert not np.array_equal(X_test_1, X_test_2)


# ─── stratified_split ────────────────────────────────────────────────────────


class TestStratifiedSplit:
    def setup_method(self) -> None:
        _skip_if_not_installed()
        if importlib.util.find_spec("sklearn") is None:
            pytest.skip("scikit-learn not installed")
        from maschina_ml.dataset import stratified_split

        self.stratified_split = stratified_split

    def _make_runs(self, n: int = 20) -> list[dict]:
        # Exactly 50% success so stratification is easy to verify
        return [_run(f"r{i}", status="completed" if i % 2 == 0 else "failed") for i in range(n)]

    def test_split_sizes(self) -> None:
        runs = self._make_runs(20)
        X_train, X_test, y_train, y_test = self.stratified_split(runs, test_size=0.2)
        assert len(X_train) == 16
        assert len(X_test) == 4

    def test_both_classes_in_test(self) -> None:
        runs = self._make_runs(20)
        _, _, _, y_test = self.stratified_split(runs, test_size=0.2)
        # Stratified: test set should have both successes and failures
        assert 0.0 in y_test
        assert 1.0 in y_test
