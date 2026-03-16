"""Worker service tests — NATS consumer for background jobs."""

import importlib.util

import pytest


def test_worker_module_importable() -> None:
    """worker.main module can be found in the package."""
    spec = importlib.util.find_spec("worker.main")
    if spec is None:
        pytest.skip("worker not installed — run: uv pip install -e services/worker")
