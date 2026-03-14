"""Entry point for the Maschina background worker service."""

import asyncio
import logging
import sys

import structlog

from .consumer import run_consumer
from .workflows.temporal_worker import run_temporal_worker

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}',
)

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
)

log = structlog.get_logger()


def main() -> None:
    log.info("worker.starting")
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        log.info("worker.stopped")


async def _run() -> None:
    # Run NATS consumer and Temporal worker side-by-side.
    # If either crashes, the whole process exits and the supervisor restarts it.
    await asyncio.gather(
        run_consumer(),
        run_temporal_worker(),
    )


if __name__ == "__main__":
    main()
