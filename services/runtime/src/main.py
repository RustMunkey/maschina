import logging
import sys

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from .config import settings
from .models import ErrorResponse, RunRequest, RunResponse
from .sandbox import execute_sandboxed
from .streaming import stream_run

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}',
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="maschina-runtime",
    version="0.0.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled exception", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "message": str(exc)},
    )


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "maschina-runtime", "env": settings.node_env}


@app.post("/run", response_model=RunResponse, responses={500: {"model": ErrorResponse}})
async def run_agent(req: RunRequest) -> RunResponse:
    """Execute a single agent run.

    Called by services/daemon after dequeuing a job from NATS.
    The daemon enforces the timeout at its level as well; this service
    also enforces it internally so a runaway LLM call never blocks the worker.
    """
    logger.info("starting run", extra={"run_id": req.run_id, "model": req.model})
    try:
        return await execute_sandboxed(req)
    except RuntimeError as exc:
        raise HTTPException(status_code=504, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/stream", responses={500: {"model": ErrorResponse}})
async def stream_agent(req: RunRequest):
    """Stream an agent run as SSE chunks.

    Called by services/daemon when streaming is enabled (stream=true in job payload).
    Returns text/event-stream with chunk, done, and error event types.
    The daemon forwards each chunk to the realtime service for client delivery.
    """
    logger.info("starting streaming run", extra={"run_id": req.run_id, "model": req.model})
    try:
        return await stream_run(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.runtime_port,
        log_config=None,
    )
