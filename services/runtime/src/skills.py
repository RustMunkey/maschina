"""
Maps skill slugs to configured Tool instances for injection into AgentRunner.

Skills are passed in from the daemon as a list of slug strings.
Each slug maps to a Tool subclass from maschina_runtime.tools.
"""

import logging
import os
from typing import Any

from maschina_runtime.tools import (
    CodeExecTool,
    DelegateAgentTool,
    GitHubTool,
    HttpFetchTool,
    LinearTool,
    NotionTool,
    SlackTool,
    Tool,
    WebSearchTool,
)

logger = logging.getLogger(__name__)


def build_tools(
    skill_names: list[str],
    configs: dict[str, dict[str, Any]] | None = None,
    caller_agent_id: str = "",
    user_id: str = "",
) -> list[Tool]:
    """
    Build Tool instances for the given skill slugs.
    Unknown slugs are logged and skipped.

    Args:
        skill_names: list of skill slugs (e.g. ["http_fetch", "web_search"])
        configs: per-skill config overrides from agent_skills.config column
        caller_agent_id: ID of the agent making the run (needed for delegate_agent)
        user_id: ID of the user who owns the agent (needed for delegate_agent)
    """
    if configs is None:
        configs = {}

    tools: list[Tool] = []

    for slug in skill_names:
        cfg = configs.get(slug, {})
        try:
            tool = _build_one(slug, cfg, caller_agent_id=caller_agent_id, user_id=user_id)
            if tool is not None:
                tools.append(tool)
        except Exception as exc:
            logger.warning("Failed to build skill %s: %s", slug, exc)

    return tools


def _build_one(
    slug: str,
    cfg: dict[str, Any],
    caller_agent_id: str = "",
    user_id: str = "",
) -> Tool | None:
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

        case "slack":
            token = cfg.get("access_token", "")
            if not token:
                logger.warning(
                    "slack skill enabled but access_token not set in skill config — skipping"
                )
                return None
            return SlackTool(access_token=token)

        case "github":
            token = cfg.get("access_token", "")
            if not token:
                logger.warning(
                    "github skill enabled but access_token not set in skill config — skipping"
                )
                return None
            return GitHubTool(access_token=token, default_repo=cfg.get("default_repo", ""))

        case "notion":
            token = cfg.get("access_token", "")
            if not token:
                logger.warning(
                    "notion skill enabled but access_token not set in skill config — skipping"
                )
                return None
            return NotionTool(access_token=token)

        case "linear":
            token = cfg.get("access_token", "")
            if not token:
                logger.warning(
                    "linear skill enabled but access_token not set in skill config — skipping"
                )
                return None
            return LinearTool(access_token=token, default_team=cfg.get("default_team", ""))

        case "delegate_agent":
            from .config import settings

            if not settings.internal_secret:
                logger.warning(
                    "delegate_agent skill enabled but INTERNAL_SECRET is not set — skipping"
                )
                return None
            if not caller_agent_id or not user_id:
                logger.warning(
                    "delegate_agent skill requires caller_agent_id and user_id — skipping"
                )
                return None
            return DelegateAgentTool(
                api_url=settings.maschina_api_url,
                internal_secret=settings.internal_secret,
                caller_agent_id=caller_agent_id,
                user_id=user_id,
            )

        case _:
            logger.warning("Unknown skill slug: %s — skipping", slug)
            return None
