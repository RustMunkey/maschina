#!/usr/bin/env python3
"""
Maschina MCP Server
Private memory/context bridge between Mac and Dell Claude instances.
Both instances connect here — same files, same brain.
"""

import os
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from mcp.server.fastmcp import FastMCP

# ── Paths ────────────────────────────────────────────────────────────────────
REPO = Path(os.environ.get("MASCHINA_REPO", "/home/ash/Desktop/maschina"))
MEMORY_DIR = Path(
    os.environ.get(
        "MASCHINA_MEMORY_DIR", "/home/ash/.claude/projects/-home-ash-Desktop-maschina/memory"
    )
)
CONVERSATION_LOG = MEMORY_DIR / "conversation_history.md"
SESSION_FILE = REPO / ".claude" / "session.md"
DECISIONS_FILE = REPO / ".claude" / "decisions.md"
ARCHITECTURE_FILE = REPO / "MASTER_ARCHITECTURE.md"
MEMORY_INDEX = MEMORY_DIR / "MEMORY.md"

mcp = FastMCP("maschina", port=3333)


def _read(path: Path) -> str:
    """Read a file, return placeholder if missing."""
    if path.exists():
        return path.read_text(encoding="utf-8")
    return f"[File not found: {path}]"


def _timestamp() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")


# ── Read tools ───────────────────────────────────────────────────────────────


@mcp.tool()
def get_memory() -> str:
    """Return the full MEMORY.md index — the master list of all memory files."""
    return _read(MEMORY_INDEX)


@mcp.tool()
def get_session() -> str:
    """Return the current session log (.claude/session.md)."""
    return _read(SESSION_FILE)


@mcp.tool()
def get_architecture() -> str:
    """Return MASTER_ARCHITECTURE.md — the full system architecture doc."""
    return _read(ARCHITECTURE_FILE)


@mcp.tool()
def get_decisions() -> str:
    """Return .claude/decisions.md — locked architectural decisions."""
    return _read(DECISIONS_FILE)


@mcp.tool()
def get_context() -> str:
    """
    Single boot-shot: returns memory index + session + decisions concatenated.
    Call this once at session start to fully hydrate context in one round-trip.
    """
    parts = [
        "# === MEMORY INDEX ===",
        _read(MEMORY_INDEX),
        "\n# === CURRENT SESSION ===",
        _read(SESSION_FILE),
        "\n# === DECISIONS ===",
        _read(DECISIONS_FILE),
    ]
    return "\n".join(parts)


@mcp.tool()
def list_memory_files() -> str:
    """List all files in the memory directory with their sizes and last-modified times."""
    if not MEMORY_DIR.exists():
        return f"[Memory directory not found: {MEMORY_DIR}]"
    lines = []
    for f in sorted(MEMORY_DIR.iterdir()):
        if f.is_file():
            stat = f.stat()
            mtime = datetime.fromtimestamp(stat.st_mtime, tz=UTC).strftime("%Y-%m-%d %H:%M UTC")
            lines.append(f"{f.name}  ({stat.st_size} bytes, modified {mtime})")
    return "\n".join(lines) if lines else "[No files in memory directory]"


# ── Search ───────────────────────────────────────────────────────────────────


@mcp.tool()
def search_memory(query: str) -> str:
    """
    Case-insensitive grep across all files in the memory directory.
    Returns matching lines with filenames. Use this to find specific memories.
    """
    if not MEMORY_DIR.exists():
        return f"[Memory directory not found: {MEMORY_DIR}]"
    result = subprocess.run(
        ["grep", "-ril", "--include=*.md", query, str(MEMORY_DIR)], capture_output=True, text=True
    )
    matching_files = result.stdout.strip().splitlines()
    if not matching_files:
        return f"[No matches for '{query}']"

    output = []
    for filepath in matching_files:
        grep = subprocess.run(["grep", "-in", query, filepath], capture_output=True, text=True)
        rel = Path(filepath).name
        for line in grep.stdout.strip().splitlines():
            output.append(f"{rel}: {line}")
    return "\n".join(output)


# ── Write tools ──────────────────────────────────────────────────────────────


@mcp.tool()
def update_session(content: str) -> str:
    """
    Overwrite .claude/session.md with new content.
    Use this to record where we left off, what's in progress, open questions.
    """
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    SESSION_FILE.write_text(content, encoding="utf-8")
    return f"Session updated at {_timestamp()}"


@mcp.tool()
def append_memory(filename: str, content: str) -> str:
    """
    Append content to a specific memory file in the memory directory.
    filename: just the filename, e.g. 'feedback_testing.md' (no path needed).
    Adds a timestamp before the appended block.
    """
    # Safety: no path traversal
    safe_name = Path(filename).name
    if not safe_name.endswith(".md"):
        safe_name += ".md"
    target = MEMORY_DIR / safe_name
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    timestamp_block = f"\n\n<!-- appended {_timestamp()} -->\n{content}"
    with open(target, "a", encoding="utf-8") as f:
        f.write(timestamp_block)
    return f"Appended to {safe_name} at {_timestamp()}"


@mcp.tool()
def write_memory(filename: str, content: str) -> str:
    """
    Fully overwrite a memory file. Use this to update stale memories or
    rewrite a file from scratch. filename: just the filename, e.g. 'user_prefs.md'.
    """
    safe_name = Path(filename).name
    if not safe_name.endswith(".md"):
        safe_name += ".md"
    target = MEMORY_DIR / safe_name
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"Wrote {safe_name} at {_timestamp()}"


# ── Conversation history ─────────────────────────────────────────────────────


@mcp.tool()
def log_conversation(summary: str, branch: str = "", files_changed: str = "") -> str:
    """
    Append a timestamped entry to the persistent conversation history log.
    Call this at the end of every significant exchange to preserve full context.
    summary: what was discussed/built/decided this exchange.
    branch: current git branch (optional).
    files_changed: comma-separated list of modified files (optional).
    """
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    ts = _timestamp()
    entry = f"\n\n## {ts}"
    if branch:
        entry += f" | branch: {branch}"
    if files_changed:
        entry += f"\n**Files:** {files_changed}"
    entry += f"\n\n{summary}"
    with open(CONVERSATION_LOG, "a", encoding="utf-8") as f:
        f.write(entry)
    return f"Logged at {ts}"


@mcp.tool()
def get_conversation_log(last_n_chars: int = 4000) -> str:
    """Return the last N characters of the conversation history log."""
    if not CONVERSATION_LOG.exists():
        return "[No conversation history yet]"
    text = CONVERSATION_LOG.read_text(encoding="utf-8")
    return text[-last_n_chars:] if len(text) > last_n_chars else text


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run(transport="sse")
