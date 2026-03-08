"""
Inference entry point.
Run via: python -m maschina_model.infer
"""

import structlog

log = structlog.get_logger()


def infer(prompt: str) -> str:
    # TODO: load fine-tuned adapter + run inference
    log.info("inference not yet implemented", prompt=prompt)
    return ""


if __name__ == "__main__":
    infer("Hello, Maschina.")
