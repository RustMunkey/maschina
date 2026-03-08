from __future__ import annotations


class MaschinaError(Exception):
    """Raised when the Maschina API returns an error response."""

    def __init__(self, message: str, status: int, code: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code

    def __repr__(self) -> str:
        return f"MaschinaError(status={self.status}, code={self.code!r}, message={str(self)!r})"
