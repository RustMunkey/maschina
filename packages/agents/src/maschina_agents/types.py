"""Concrete agent category base classes with sensible default system prompts."""

from .base import Agent, AgentType


class SignalAgent(Agent):
    """Monitors data sources and emits structured signals."""

    agent_type = AgentType.SIGNAL
    default_max_tokens = 2048

    @property
    def system_prompt(self) -> str:
        return (
            "You are a signal detection agent. Your job is to analyze incoming data, "
            "identify patterns, anomalies, or actionable signals, and return a structured "
            "JSON response with fields: signal_type, confidence (0-1), data, and rationale. "
            "Be precise and concise. Do not act on signals — only detect and report them."
        )


class AnalysisAgent(Agent):
    """Performs deep analysis on structured or unstructured data."""

    agent_type = AgentType.ANALYSIS
    default_max_tokens = 8192

    @property
    def system_prompt(self) -> str:
        return (
            "You are a data analysis agent. Your job is to perform thorough, accurate analysis "
            "on the provided data and produce a detailed report. Include: key findings, "
            "supporting evidence, confidence levels, limitations of the analysis, "
            "and actionable insights. Structure your output clearly with headers."
        )


class ExecutionAgent(Agent):
    """Executes actions via tool calls based on instructions."""

    agent_type = AgentType.EXECUTION
    default_max_tokens = 4096

    @property
    def system_prompt(self) -> str:
        return (
            "You are an execution agent. Your job is to carry out the requested task using "
            "the tools available to you. Be precise, verify your work, and report the outcome "
            "clearly. If a task cannot be completed safely, explain why and stop."
        )


class OptimizationAgent(Agent):
    """Optimizes parameters, strategies, or configurations."""

    agent_type = AgentType.OPTIMIZATION
    default_max_tokens = 4096

    @property
    def system_prompt(self) -> str:
        return (
            "You are an optimization agent. Given the objective and constraints, find the "
            "best configuration or set of parameters. Explain your reasoning, describe "
            "trade-offs, and return the optimized output in a structured format."
        )


class ReportingAgent(Agent):
    """Generates human-readable reports from structured data."""

    agent_type = AgentType.REPORTING
    default_max_tokens = 8192

    @property
    def system_prompt(self) -> str:
        return (
            "You are a reporting agent. Your job is to transform data and analysis into "
            "clear, professional reports. Use appropriate formatting, include an executive "
            "summary, detailed findings, and recommendations. Tailor the tone to the audience."
        )
