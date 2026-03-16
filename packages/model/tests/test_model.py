"""Model package tests — fine-tuned model training, eval, and inference."""

import importlib.util

import pytest


def test_model_package_importable() -> None:
    """maschina_model package can be found."""
    spec = importlib.util.find_spec("maschina_model")
    if spec is None:
        pytest.skip("maschina_model not installed — run: uv pip install -e packages/model")
