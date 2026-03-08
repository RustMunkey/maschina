"""
Unit tests for model routing and billing multiplier logic in runner.py.
Tests the private helpers directly — no actual LLM calls made.
"""

import sys
import types
import unittest.mock as mock

# ─── Stub out packages that aren't installed in CI ───────────────────────────


def _stub_module(name: str, **attrs):
    mod = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules[name] = mod
    return mod


# Stub maschina_risk
_stub_module(
    "maschina_risk",
    check_input=lambda text: mock.MagicMock(approved=True, flags=[]),
    check_output=lambda text: mock.MagicMock(flags=[]),
)

# Stub maschina_runtime
_stub_module(
    "maschina_runtime",
    RunInput=mock.MagicMock,
    AgentRunner=mock.MagicMock,
)

# Stub src.config.settings before importing runner
settings_mock = mock.MagicMock()
settings_mock.anthropic_api_key = ""
settings_mock.ollama_base_url = "http://localhost:11434/v1"
settings_mock.ollama_model = "llama3.2"
settings_mock.max_output_tokens = 16_384
settings_mock.use_ollama = True

config_mod = _stub_module("src.config", settings=settings_mock)

# Now we can import the helpers
from src.runner import _get_multiplier, _is_ollama, _ollama_model_name  # noqa: E402

# ─── Multiplier tests ─────────────────────────────────────────────────────────


class TestGetMultiplier:
    def test_haiku_is_1x(self):
        assert _get_multiplier("claude-haiku-4-5-20251001") == 1

    def test_sonnet_is_3x(self):
        assert _get_multiplier("claude-sonnet-4-6") == 3

    def test_opus_is_15x(self):
        assert _get_multiplier("claude-opus-4-6") == 15

    def test_ollama_is_0x(self):
        assert _get_multiplier("ollama/llama3.2") == 0
        assert _get_multiplier("ollama/mistral") == 0

    def test_unknown_model_defaults_to_1x(self):
        assert _get_multiplier("gpt-99") == 1
        assert _get_multiplier("") == 1


# ─── Routing helpers ──────────────────────────────────────────────────────────


class TestIsOllama:
    def test_ollama_prefix(self):
        assert _is_ollama("ollama/llama3.2") is True
        assert _is_ollama("ollama/mistral") is True

    def test_anthropic_is_not_ollama(self):
        assert _is_ollama("claude-haiku-4-5-20251001") is False
        assert _is_ollama("claude-sonnet-4-6") is False


class TestOllamaModelName:
    def test_strips_prefix(self):
        assert _ollama_model_name("ollama/llama3.2") == "llama3.2"
        assert _ollama_model_name("ollama/mistral") == "mistral"
