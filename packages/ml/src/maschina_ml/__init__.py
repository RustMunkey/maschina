# maschina-ml — ML training, RL, and evaluation utilities
__version__ = "0.0.0"

from .dataset import normalize, stratified_split, train_test_split
from .eval import RunsetMetrics, classification_metrics, compute_metrics
from .features import RunFeatures, batch_extract, extract_features
from .rl import RewardSignal, batch_rewards, compute_reward

__all__ = [
    # features
    "RunFeatures",
    "extract_features",
    "batch_extract",
    # rl
    "RewardSignal",
    "compute_reward",
    "batch_rewards",
    # eval
    "RunsetMetrics",
    "compute_metrics",
    "classification_metrics",
    # dataset
    "train_test_split",
    "stratified_split",
    "normalize",
]
