"""Domain-level exceptions used by API routes."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class DomainError(Exception):
    """Base error with stable API surface."""

    message: str
    error_code: str = "domain_error"
    status_code: int = 400
    context: dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.message


class DomainValidationError(DomainError):
    def __init__(self, message: str, *, error_code: str = "validation_error", context: dict[str, Any] | None = None):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=400,
            context=context or {},
        )


class DomainConflictError(DomainError):
    def __init__(self, message: str, *, error_code: str = "conflict_error", context: dict[str, Any] | None = None):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=409,
            context=context or {},
        )


class DomainInternalError(DomainError):
    def __init__(self, message: str, *, error_code: str = "internal_error", context: dict[str, Any] | None = None):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=500,
            context=context or {},
        )
