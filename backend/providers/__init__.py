"""Bank provider registry and adapter exports."""

from __future__ import annotations

from typing import Any

from .base import ProviderCatalogEntry
from . import fakebank, oauth_sandbox

_PROVIDERS: dict[str, Any] = {
    fakebank.PROVIDER_NAME: fakebank,
    oauth_sandbox.PROVIDER_NAME: oauth_sandbox,
}


def get_bank_provider(provider_name: str | None):
    key = str(provider_name or "").strip().lower()
    return _PROVIDERS.get(key)


def list_bank_provider_entries() -> list[ProviderCatalogEntry]:
    return [provider.catalog_entry() for provider in _PROVIDERS.values()]


def list_bank_provider_names() -> list[str]:
    return sorted(_PROVIDERS.keys())


__all__ = [
    "ProviderCatalogEntry",
    "get_bank_provider",
    "list_bank_provider_entries",
    "list_bank_provider_names",
]
