"""
Dataset loading and preprocessing for fine-tuning.
"""

import structlog

log = structlog.get_logger()


def load_dataset(path: str):
    # TODO: load agent execution traces, tool use examples,
    # financial reasoning datasets for fine-tuning
    log.info("dataset loading not yet implemented", path=path)
    return None
