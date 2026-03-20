#!/usr/bin/env python3
"""
GitHub webhook listener for Maschina auto-deploy.
Receives push events from GitHub, verifies HMAC-SHA256 signature,
triggers scripts/update.sh when a push lands on main.

Port: 9000
Secret: WEBHOOK_SECRET env var (must match the secret set in GitHub)
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [webhook] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger(__name__)

WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "").encode()
PORT = int(os.environ.get("WEBHOOK_PORT", "9000"))
REPO_DIR = Path(os.environ.get("MASCHINA_DIR", Path.home() / "Desktop" / "maschina"))
UPDATE_SCRIPT = REPO_DIR / "scripts" / "update.sh"


def _verify_signature(body: bytes, sig_header: str) -> bool:
    if not WEBHOOK_SECRET:
        log.warning("WEBHOOK_SECRET not set — skipping signature verification")
        return True
    if not sig_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(WEBHOOK_SECRET, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig_header)


class WebhookHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        log.info(format, *args)

    def _respond(self, status: int, body: str) -> None:
        encoded = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self) -> None:
        if self.path != "/webhook":
            self._respond(404, '{"error":"not found"}')
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        sig = self.headers.get("X-Hub-Signature-256", "")
        if not _verify_signature(body, sig):
            log.warning("invalid signature from %s", self.client_address[0])
            self._respond(401, '{"error":"invalid signature"}')
            return

        event = self.headers.get("X-GitHub-Event", "")
        if event != "push":
            self._respond(200, '{"ok":true,"skipped":"not a push event"}')
            return

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._respond(400, '{"error":"invalid json"}')
            return

        ref = payload.get("ref", "")
        if ref != "refs/heads/main":
            log.info("push to %s — ignoring (not main)", ref)
            self._respond(200, '{"ok":true,"skipped":"not main branch"}')
            return

        after = payload.get("after", "unknown")
        log.info("push to main detected (commit %s) — triggering deploy", after[:8])
        self._respond(200, '{"ok":true,"deploying":true}')

        # Run update.sh in background so we don't block the response
        subprocess.Popen(
            ["bash", str(UPDATE_SCRIPT)],
            cwd=str(REPO_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )

    def do_GET(self) -> None:
        if self.path == "/health":
            self._respond(200, '{"ok":true}')
        else:
            self._respond(404, '{"error":"not found"}')


if __name__ == "__main__":
    if not WEBHOOK_SECRET:
        log.warning("WEBHOOK_SECRET is not set — all requests will be accepted")
    log.info("webhook server listening on port %d", PORT)
    server = HTTPServer(("0.0.0.0", PORT), WebhookHandler)
    server.serve_forever()
