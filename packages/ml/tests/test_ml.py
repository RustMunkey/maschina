"""ML package tests — torch/sklearn model utilities."""

import importlib.util

import pytest


def test_ml_package_importable() -> None:
    """maschina_ml package can be found."""
    spec = importlib.util.find_spec("maschina_ml")
    if spec is None:
        pytest.skip("maschina_ml not installed — run: uv pip install -e packages/ml")
