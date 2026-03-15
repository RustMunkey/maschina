"""
Maps skill slugs to configured Tool instances for injection into AgentRunner.

Skills are passed in from the daemon as a list of slug strings.
Each slug maps to a Tool subclass from maschina_runtime.tools.
"""

import logging
import os
from typing import Any

from maschina_runtime.tools import CodeExecTool, HttpFetchTool, Tool, WebSearchTool

logger = logging.getLogger(__name__)


def build_tools(
    skill_names: list[str], configs: dict[str, dict[str, Any]] | None = None
) -> list[Tool]:
    """
    Build Tool instances for the given skill slugs.
    Unknown slugs are logged and skipped.

    Args:
        skill_names: list of skill slugs (e.g. ["http_fetch", "web_search"])
        configs: per-skill config overrides from agent_skills.config column
    """
    if configs is None:
        configs = {}

    tools: list[Tool] = []

    for slug in skill_names:
        cfg = configs.get(slug, {})
        try:
            tool = _build_one(slug, cfg)
            if tool is not None:
                tools.append(tool)
        except Exception as exc:
            logger.warning("Failed to build skill %s: %s", slug, exc)

    return tools


def _build_one(slug: str, cfg: dict[str, Any]) -> Tool | None:
    match slug:
        case "http_fetch":
            allowed_raw = cfg.get("allowed_domains", "")
            allowed = (
                [d.strip() for d in allowed_raw.split(",") if d.strip()] if allowed_raw else []
            )
            return HttpFetchTool(allowed_domains=allowed)

        case "web_search":
            api_key = os.environ.get("BRAVE_SEARCH_API_KEY", "")
            if not api_key:
                logger.warning(
                    "web_search skill enabled but BRAVE_SEARCH_API_KEY is not set — skipping"
                )
                return None
            max_results = int(cfg.get("max_results", 5))
            return WebSearchTool(api_key=api_key, max_results=max_results)

        case "code_exec":
            from .config import settings

            timeout_secs = int(cfg.get("timeout_secs", 10))
            return CodeExecTool(
                timeout_secs=timeout_secs,
                memory_limit_mb=settings.sandbox_memory_limit_mb
                if settings.sandbox_enabled
                else 512,
                cpu_limit_secs=settings.sandbox_cpu_limit_secs if settings.sandbox_enabled else 30,
            )

        case _:
            logger.warning("Unknown skill slug: %s — skipping", slug)
            return None
