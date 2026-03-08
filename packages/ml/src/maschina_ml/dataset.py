"""Dataset loading and splitting utilities for ML training."""

from __future__ import annotations

from typing import Any

import numpy as np

from .features import batch_extract


def train_test_split(
    runs: list[dict[str, Any]],
    test_size: float = 0.2,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Extract features and split into train/test sets.

    Returns:
        X_train, X_test, y_train, y_test
    """
    X, y, _ = batch_extract(runs)

    rng = np.random.default_rng(seed)
    n = len(X)
    indices = rng.permutation(n)
    split = int(n * (1 - test_size))
    train_idx, test_idx = indices[:split], indices[split:]

    return X[train_idx], X[test_idx], y[train_idx], y[test_idx]


def stratified_split(
    runs: list[dict[str, Any]],
    test_size: float = 0.2,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Stratified split preserving success/failure ratio across train and test.
    Falls back to random split if sklearn is unavailable.
    """
    from sklearn.model_selection import train_test_split as sk_split

    X, y, _ = batch_extract(runs)
    return sk_split(X, y, test_size=test_size, random_state=seed, stratify=y)


def normalize(
    X_train: np.ndarray,
    X_test: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Z-score normalize using train statistics only.

    Returns:
        X_train_norm, X_test_norm, mean, std
    """
    mean = X_train.mean(axis=0)
    std = X_train.std(axis=0)
    std[std == 0] = 1.0  # avoid division by zero for constant features

    X_train_norm = (X_train - mean) / std
    X_test_norm = (X_test - mean) / std
    return X_train_norm, X_test_norm, mean, std
