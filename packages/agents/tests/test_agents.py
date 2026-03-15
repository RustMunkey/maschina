"""Unit tests for maschina_agents — agent types, base class, to_dict."""

import pytest
from maschina_agents.base import Agent, AgentType
from maschina_agents.types import (
    AnalysisAgent,
    ExecutionAgent,
    OptimizationAgent,
    ReportingAgent,
    SignalAgent,
)

# ─── AgentType enum ───────────────────────────────────────────────────────────


class TestAgentType:
    def test_all_five_types_exist(self):
        assert AgentType.SIGNAL == "signal"
        assert AgentType.ANALYSIS == "analysis"
        assert AgentType.EXECUTION == "execution"
        assert AgentType.OPTIMIZATION == "optimization"
        assert AgentType.REPORTING == "reporting"

    def test_agent_type_is_str_enum(self):
        assert isinstance(AgentType.SIGNAL, str)
        # StrEnum values compare equal to plain strings
        assert AgentType.SIGNAL == "signal"

    def test_all_type_values_are_lowercase(self):
        for member in AgentType:
            assert member.value == member.value.lower()

    def test_agent_type_count(self):
        assert len(list(AgentType)) == 5


# ─── Concrete agent instantiation ─────────────────────────────────────────────


class TestSignalAgent:
    def test_instantiation(self):
        agent = SignalAgent()
        assert agent.agent_type == AgentType.SIGNAL

    def test_system_prompt_is_non_empty_string(self):
        agent = SignalAgent()
        assert isinstance(agent.system_prompt, str)
        assert len(agent.system_prompt) > 20

    def test_system_prompt_contains_signal_context(self):
        agent = SignalAgent()
        assert "signal" in agent.system_prompt.lower()

    def test_default_max_tokens(self):
        agent = SignalAgent()
        assert agent.default_max_tokens == 2048

    def test_tools_returns_empty_list_by_default(self):
        agent = SignalAgent()
        assert agent.tools() == []

    def test_to_dict_shape(self):
        agent = SignalAgent()
        d = agent.to_dict()
        assert d["agent_type"] == "signal"
        assert isinstance(d["system_prompt"], str)
        assert d["model"] == "claude-sonnet-4-6"
        assert d["max_tokens"] == 2048
        assert d["tools"] == []


class TestAnalysisAgent:
    def test_instantiation(self):
        assert AnalysisAgent().agent_type == AgentType.ANALYSIS

    def test_max_tokens_is_8192(self):
        assert AnalysisAgent().default_max_tokens == 8192

    def test_system_prompt_mentions_analysis(self):
        agent = AnalysisAgent()
        assert "analy" in agent.system_prompt.lower()


class TestExecutionAgent:
    def test_instantiation(self):
        assert ExecutionAgent().agent_type == AgentType.EXECUTION

    def test_max_tokens_is_4096(self):
        assert ExecutionAgent().default_max_tokens == 4096

    def test_system_prompt_mentions_tools(self):
        agent = ExecutionAgent()
        assert "tool" in agent.system_prompt.lower()


class TestOptimizationAgent:
    def test_instantiation(self):
        assert OptimizationAgent().agent_type == AgentType.OPTIMIZATION

    def test_system_prompt_mentions_optimization(self):
        agent = OptimizationAgent()
        assert "optim" in agent.system_prompt.lower()


class TestReportingAgent:
    def test_instantiation(self):
        assert ReportingAgent().agent_type == AgentType.REPORTING

    def test_max_tokens_is_8192(self):
        assert ReportingAgent().default_max_tokens == 8192

    def test_system_prompt_mentions_report(self):
        agent = ReportingAgent()
        assert "report" in agent.system_prompt.lower()


# ─── Agent ABC enforcement ────────────────────────────────────────────────────


class TestAgentAbstractBase:
    def test_cannot_instantiate_base_agent_directly(self):
        with pytest.raises(TypeError):
            Agent()  # type: ignore[abstract]

    def test_subclass_without_system_prompt_cannot_be_instantiated(self):
        class IncompleteAgent(Agent):
            agent_type = AgentType.SIGNAL
            # Missing system_prompt property

        with pytest.raises(TypeError):
            IncompleteAgent()  # type: ignore[abstract]

    def test_valid_subclass_instantiates(self):
        class MinimalAgent(Agent):
            agent_type = AgentType.SIGNAL

            @property
            def system_prompt(self) -> str:
                return "You are a minimal test agent."

        agent = MinimalAgent()
        assert agent.agent_type == AgentType.SIGNAL
        assert agent.system_prompt == "You are a minimal test agent."
        assert agent.tools() == []

    def test_default_model_is_sonnet(self):
        class MinimalAgent(Agent):
            agent_type = AgentType.SIGNAL

            @property
            def system_prompt(self) -> str:
                return "test"

        assert MinimalAgent().default_model == "claude-sonnet-4-6"

    def test_to_dict_with_custom_tools(self):
        from unittest.mock import MagicMock

        class AgentWithTools(Agent):
            agent_type = AgentType.EXECUTION

            @property
            def system_prompt(self) -> str:
                return "test"

            def tools(self):
                tool = MagicMock()
                tool.name = "search"
                return [tool]

        d = AgentWithTools().to_dict()
        assert "search" in d["tools"]
