"""
Pre-run and post-run risk checks for agent execution.

Pre-run  — called before the agent runs; can block the run entirely.
Post-run — called after output is produced; can flag or suppress output.
"""

import re

from .models import RiskFlag, RiskLevel, RiskResult

# ─── Blocked patterns ─────────────────────────────────────────────────────────

_BLOCKED_PATTERNS = [
    # Prompt injection attempts
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.IGNORECASE),
    re.compile(r"disregard\s+(all\s+)?previous\s+instructions", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+(?:a\s+)?(?:DAN|jailbreak)", re.IGNORECASE),
    # System-level commands
    re.compile(r"(?:rm|del|format)\s+-rf?\s+/", re.IGNORECASE),
    re.compile(r"sudo\s+rm\b", re.IGNORECASE),
    # Credential exfiltration patterns
    re.compile(r"send\s+(?:me|us)\s+(?:your\s+)?(?:api\s+key|password|secret)", re.IGNORECASE),
]

# ─── PII patterns (for output scanning) ──────────────────────────────────────

_PII_PATTERNS = [
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "ssn"),  # SSN
    (re.compile(r"\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b"), "cc"),  # credit card
    (re.compile(r"\bpassword\s*[:=]\s*\S+", re.IGNORECASE), "password"),
    (re.compile(r"\bapi[_-]?key\s*[:=]\s*\S+", re.IGNORECASE), "api_key"),
]

# ─── Input length limits ──────────────────────────────────────────────────────

MAX_INPUT_CHARS = 100_000


def check_input(text: str, tier: str = "access") -> RiskResult:
    """
    Validate the user input before passing it to an agent.
    Returns a RiskResult; if `approved` is False the run should be blocked.
    """
    flags: list[RiskFlag] = []
    score = 0.0

    # Length check
    if len(text) > MAX_INPUT_CHARS:
        flags.append(
            RiskFlag(
                code="input_too_long",
                message=f"Input exceeds {MAX_INPUT_CHARS:,} character limit ({len(text):,} chars)",
                level=RiskLevel.BLOCK,
            )
        )
        score = 1.0

    # Blocked pattern check
    for pattern in _BLOCKED_PATTERNS:
        if pattern.search(text):
            flags.append(
                RiskFlag(
                    code="blocked_pattern",
                    message=f"Input contains a blocked pattern: {pattern.pattern[:60]}",
                    level=RiskLevel.BLOCK,
                )
            )
            score = max(score, 1.0)

    if not flags:
        return RiskResult.safe()

    worst = max(f.level for f in flags)
    return RiskResult(
        approved=worst != RiskLevel.BLOCK,
        level=worst,
        flags=flags,
        score=score,
    )


def check_output(text: str) -> RiskResult:
    """
    Scan agent output for PII or sensitive data before returning to the user.
    Flags issues but does NOT block (output is already generated).
    """
    flags: list[RiskFlag] = []
    score = 0.0

    for pattern, label in _PII_PATTERNS:
        if pattern.search(text):
            flags.append(
                RiskFlag(
                    code=f"pii_{label}",
                    message=f"Output may contain sensitive data: {label}",
                    level=RiskLevel.HIGH,
                )
            )
            score = max(score, 0.8)

    if not flags:
        return RiskResult.safe()

    return RiskResult(
        approved=True,  # output is flagged, not blocked
        level=RiskLevel.HIGH,
        flags=flags,
        score=score,
    )


def check_quota_pre_run(
    *,
    monthly_token_limit: int,
    tokens_used_this_month: int,
    estimated_tokens: int = 4096,
) -> RiskResult:
    """
    Check whether the user has sufficient quota for the estimated run cost.
    """
    if monthly_token_limit <= 0:
        return RiskResult.safe()  # unlimited

    remaining = monthly_token_limit - tokens_used_this_month
    if remaining <= 0:
        return RiskResult(
            approved=False,
            level=RiskLevel.BLOCK,
            flags=[
                RiskFlag(
                    code="quota_exhausted",
                    message="Monthly token quota exhausted",
                    level=RiskLevel.BLOCK,
                )
            ],
            score=1.0,
        )

    if remaining < estimated_tokens:
        return RiskResult(
            approved=True,
            level=RiskLevel.MEDIUM,
            flags=[
                RiskFlag(
                    code="quota_low",
                    message=f"Only {remaining:,} tokens remaining this month",
                    level=RiskLevel.MEDIUM,
                )
            ],
            score=0.5,
        )

    return RiskResult.safe()
