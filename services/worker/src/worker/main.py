"""Entry point for the Maschina background worker service."""

import asyncio
import logging
import sys

import structlog

from .consumer import run_consumer

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
        asyncio.run(run_consumer())
    except KeyboardInterrupt:
        log.info("worker.stopped")


if __name__ == "__main__":
    main()
