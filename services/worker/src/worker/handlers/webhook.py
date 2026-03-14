"""Outbound webhook dispatch handler — sign, POST, retry, log."""

from __future__ import annotations

import hashlib
import hmac
import json
import time

import asyncpg
import httpx
import structlog

from ..config import settings
from ..models import WebhookDispatchJob

log = structlog.get_logger()

ALGORITHM = "sha256"
HEADER = "X-Maschina-Signature"
MAX_ATTEMPTS = 5
TIMEOUT_SECS = 10

# Exponential backoff delays (seconds) indexed by attempt number (1-based)
BACKOFF_SECS = [10, 30, 90, 300, 900]


def _sign(payload: str, secret: str) -> str:
    """HMAC-SHA256 signature matching the TypeScript sign.ts implementation."""
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{ALGORITHM}={sig}"


async def handle_webhook_dispatch(job: WebhookDispatchJob) -> None:
    """
    Deliver a webhook event to the user's endpoint.

    Flow:
    1. Load webhook row + raw secret from DB
    2. Sign the payload
    3. POST to endpoint (10s timeout)
    4. Log result to webhook_deliveries
    5. On failure: schedule retry or mark webhook as failing
    """
    conn = await asyncpg.connect(settings.database_url)
    try:
        await _dispatch(conn, job)
    finally:
        await conn.close()


async def _dispatch(conn: asyncpg.Connection, job: WebhookDispatchJob) -> None:
    # Load webhook — verify it's still active
    row = await conn.fetchrow(
        """
        SELECT id, url, secret_hash, status, failure_count
        FROM webhooks
        WHERE id = $1
        """,
        job.webhook_id,
    )

    if not row:
        log.warning("webhook.not_found", webhook_id=job.webhook_id)
        return

    if row["status"] != "active":
        log.info("webhook.skipped_inactive", webhook_id=job.webhook_id, status=row["status"])
        return

    payload_str = json.dumps(job.payload, separators=(",", ":"))
    signature = _sign(payload_str, row["secret_hash"])

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Maschina-Webhook/1.0",
        HEADER: signature,
        "X-Maschina-Event": job.event,
        "X-Maschina-Delivery": job.delivery_id,
    }

    start = time.monotonic()
    success = False
    response_status: int | None = None
    response_body: str | None = None

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECS) as client:
            resp = await client.post(row["url"], content=payload_str, headers=headers)
            response_status = resp.status_code
            response_body = resp.text[:500]
            success = resp.is_success

    except Exception as exc:
        response_body = str(exc)[:500]
        log.warning("webhook.delivery_error", webhook_id=job.webhook_id, error=str(exc))

    duration_ms = int((time.monotonic() - start) * 1000)

    if success:
        # Log success, reset failure counter
        await conn.execute(
            """
            UPDATE webhook_deliveries
            SET status = 'success', response_status = $1, response_body = $2,
                delivered_at = NOW()
            WHERE id = $3
            """,
            response_status,
            response_body,
            job.delivery_id,
        )
        await conn.execute(
            "UPDATE webhooks SET failure_count = 0 WHERE id = $1",
            job.webhook_id,
        )
        log.info(
            "webhook.delivered",
            webhook_id=job.webhook_id,
            delivery_id=job.delivery_id,
            status=response_status,
            duration_ms=duration_ms,
        )
    else:
        new_failure_count = row["failure_count"] + 1
        new_attempt = job.attempt + 1
        next_retry_secs = (
            BACKOFF_SECS[job.attempt - 1] if job.attempt - 1 < len(BACKOFF_SECS) else None
        )

        if new_attempt > MAX_ATTEMPTS or next_retry_secs is None:
            # Max attempts reached — mark webhook as failing
            await conn.execute(
                """
                UPDATE webhook_deliveries
                SET status = 'failed', response_status = $1, response_body = $2, attempt = $3
                WHERE id = $4
                """,
                response_status,
                response_body,
                job.attempt,
                job.delivery_id,
            )
            await conn.execute(
                """
                UPDATE webhooks
                SET failure_count = $1,
                    status = CASE WHEN $1 >= 5 THEN 'failing'::webhook_status ELSE status END
                WHERE id = $2
                """,
                new_failure_count,
                job.webhook_id,
            )
            log.error(
                "webhook.exhausted",
                webhook_id=job.webhook_id,
                delivery_id=job.delivery_id,
                attempts=job.attempt,
            )
        else:
            # Schedule retry
            await conn.execute(
                """
                UPDATE webhook_deliveries
                SET status = 'retrying', response_status = $1, response_body = $2,
                    attempt = $3,
                    next_retry_at = NOW() + ($4 || ' seconds')::interval
                WHERE id = $5
                """,
                response_status,
                response_body,
                new_attempt,
                str(next_retry_secs),
                job.delivery_id,
            )
            await conn.execute(
                "UPDATE webhooks SET failure_count = $1 WHERE id = $2",
                new_failure_count,
                job.webhook_id,
            )
            log.warning(
                "webhook.retry_scheduled",
                webhook_id=job.webhook_id,
                delivery_id=job.delivery_id,
                attempt=new_attempt,
                retry_in_secs=next_retry_secs,
            )
