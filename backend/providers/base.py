"""Shared types for bank provider adapters."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ProviderCatalogEntry:
    """Machine-readable provider readiness metadata for bank routes and UI."""

    provider: str
    display_name: str
    connect_mode: str
    integration_status: str
    ready: bool
    supports_sync_preview: bool
    default_limit: int
    missing_config: list[str] = field(default_factory=list)
    supported_scopes: list[str] = field(default_factory=lambda: ["transactions:read"])
    notes: str | None = None
    setup_doc: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "display_name": self.display_name,
            "connect_mode": self.connect_mode,
            "integration_status": self.integration_status,
            "ready": bool(self.ready),
            "supports_sync_preview": bool(self.supports_sync_preview),
            "default_limit": int(self.default_limit),
            "missing_config": list(self.missing_config),
            "supported_scopes": list(self.supported_scopes),
            "notes": self.notes,
            "setup_doc": self.setup_doc,
        }
