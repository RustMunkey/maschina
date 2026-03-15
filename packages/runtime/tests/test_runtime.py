"""Unit tests for maschina_runtime models — RunInput, RunResult, Message."""

import pytest
from maschina_runtime.models import Message, RunInput, RunResult, ToolResult
from pydantic import ValidationError

# ─── Message ──────────────────────────────────────────────────────────────────


class TestMessage:
    def test_valid_user_message(self):
        msg = Message(role="user", content="Hello!")
        assert msg.role == "user"
        assert msg.content == "Hello!"

    def test_valid_assistant_message(self):
        msg = Message(role="assistant", content="Hi there!")
        assert msg.role == "assistant"

    def test_missing_content_raises(self):
        with pytest.raises(ValidationError):
            Message(role="user")  # type: ignore[call-arg]

    def test_missing_role_raises(self):
        with pytest.raises(ValidationError):
            Message(content="hello")  # type: ignore[call-arg]


# ─── RunInput ─────────────────────────────────────────────────────────────────


class TestRunInput:
    def test_minimal_run_input(self):
        run = RunInput(run_id="run-001", message="Analyze this dataset")
        assert run.run_id == "run-001"
        assert run.message == "Analyze this dataset"
        assert run.history == []
        assert run.metadata == {}

    def test_run_input_with_history(self):
        history = [
            Message(role="user", content="Start here"),
            Message(role="assistant", content="Got it"),
        ]
        run = RunInput(run_id="run-002", message="Continue", history=history)
        assert len(run.history) == 2
        assert run.history[0].role == "user"

    def test_run_input_with_metadata(self):
        run = RunInput(run_id="run-003", message="Test", metadata={"source": "api", "priority": 1})
        assert run.metadata["source"] == "api"
        assert run.metadata["priority"] == 1

    def test_run_input_missing_run_id_raises(self):
        with pytest.raises(ValidationError):
            RunInput(message="hello")  # type: ignore[call-arg]

    def test_run_input_missing_message_raises(self):
        with pytest.raises(ValidationError):
            RunInput(run_id="run-001")  # type: ignore[call-arg]

    def test_run_input_serializes_to_dict(self):
        run = RunInput(run_id="run-abc", message="Do the thing")
        d = run.model_dump()
        assert d["run_id"] == "run-abc"
        assert d["message"] == "Do the thing"
        assert d["history"] == []
        assert d["metadata"] == {}


# ─── ToolResult ───────────────────────────────────────────────────────────────


class TestToolResult:
    def test_successful_tool_result(self):
        tr = ToolResult(tool_name="search", result="found 10 results")
        assert tr.tool_name == "search"
        assert tr.result == "found 10 results"
        assert tr.error is None

    def test_failed_tool_result(self):
        tr = ToolResult(tool_name="search", result="", error="timeout")
        assert tr.error == "timeout"

    def test_error_defaults_to_none(self):
        tr = ToolResult(tool_name="fetch", result="ok")
        assert tr.error is None


# ─── RunResult ────────────────────────────────────────────────────────────────


class TestRunResult:
    def test_minimal_run_result(self):
        result = RunResult(run_id="run-001", output="Done.")
        assert result.run_id == "run-001"
        assert result.output == "Done."
        assert result.tool_calls == []
        assert result.input_tokens == 0
        assert result.output_tokens == 0
        assert result.turns == 1
        assert result.stopped_reason == "end_turn"

    def test_run_result_with_token_counts(self):
        result = RunResult(
            run_id="run-002",
            output="Analysis complete.",
            input_tokens=1024,
            output_tokens=512,
            turns=3,
        )
        assert result.input_tokens == 1024
        assert result.output_tokens == 512
        assert result.turns == 3

    def test_run_result_with_tool_calls(self):
        tool_calls = [
            ToolResult(tool_name="search", result="10 results"),
            ToolResult(tool_name="fetch", result="page content"),
        ]
        result = RunResult(run_id="run-003", output="Done", tool_calls=tool_calls)
        assert len(result.tool_calls) == 2
        assert result.tool_calls[0].tool_name == "search"

    def test_run_result_missing_run_id_raises(self):
        with pytest.raises(ValidationError):
            RunResult(output="done")  # type: ignore[call-arg]

    def test_run_result_serializes_correctly(self):
        result = RunResult(run_id="run-x", output="ok", input_tokens=100, output_tokens=50)
        d = result.model_dump()
        assert d["run_id"] == "run-x"
        assert d["input_tokens"] == 100
        assert d["output_tokens"] == 50
        assert d["tool_calls"] == []

    def test_stopped_reason_custom_value(self):
        result = RunResult(run_id="run-y", output="partial", stopped_reason="max_tokens")
        assert result.stopped_reason == "max_tokens"
