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

# Stub maschina_runtime as a package (needs __path__ so submodule imports work)
_rt = _stub_module("maschina_runtime", RunInput=mock.MagicMock, AgentRunner=mock.MagicMock)
_rt.__path__ = []  # marks it as a package to Python's import system

# Stub maschina_runtime.models (imported by ollama_runner.py at module level)
_stub_module("maschina_runtime.models", RunInput=mock.MagicMock, RunResult=mock.MagicMock)

# Stub maschina_runtime.tools (imported by src.skills which is imported by src.runner)
_stub_module(
    "maschina_runtime.tools",
    Tool=mock.MagicMock,
    HttpFetchTool=mock.MagicMock,
    WebSearchTool=mock.MagicMock,
    CodeExecTool=mock.MagicMock,
)

# Stub src.skills (imported by src.runner)
_stub_module("src.skills", build_tools=lambda names, configs=None: [])

# Stub src.memory (imported by src.runner)
_stub_module(
    "src.memory",
    retrieve_memories=lambda *a, **kw: [],
    store_memory=lambda *a, **kw: None,
)

# Stub openai (imported by ollama_runner.py)
_stub_module("openai", AsyncOpenAI=mock.MagicMock)

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

    def test_gpt5_mini_is_1x(self):
        assert _get_multiplier("gpt-5-mini") == 1

    def test_gpt5_is_8x(self):
        assert _get_multiplier("gpt-5") == 8

    def test_o3_is_20x(self):
        assert _get_multiplier("o3") == 20

    def test_unknown_model_defaults_to_2x_passthrough(self):
        assert _get_multiplier("gpt-99") == 2
        assert _get_multiplier("") == 2


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
