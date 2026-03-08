from enum import StrEnum

from pydantic import BaseModel


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    BLOCK = "block"  # Run must not proceed


class RiskFlag(BaseModel):
    code: str
    message: str
    level: RiskLevel


class RiskResult(BaseModel):
    approved: bool
    level: RiskLevel
    flags: list[RiskFlag]
    score: float  # 0.0 (safe) – 1.0 (maximum risk)

    @classmethod
    def safe(cls) -> "RiskResult":
        return cls(approved=True, level=RiskLevel.LOW, flags=[], score=0.0)
