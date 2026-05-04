"""Generic OAuth sandbox provider metadata.

This is config and readiness scaffolding only. It lets the app report exactly
what a future real provider still needs without guessing token exchange or
transaction payload mapping.
"""

from __future__ import annotations

import os
from urllib.parse import urlencode

from flask import current_app, has_app_context

from backend.providers.base import ProviderCatalogEntry

PROVIDER_NAME = "oauth_sandbox"
DISPLAY_NAME = "OAuth Sandbox Provider"
DEFAULT_LIMIT = 50
SETUP_DOC = "docs/runbooks/open-banking-provider-onboarding.md"

_REQUIRED_CONFIG_KEYS = [
    "OPEN_BANKING_OAUTH_SANDBOX_AUTH_URL",
    "OPEN_BANKING_OAUTH_SANDBOX_TOKEN_URL",
    "OPEN_BANKING_OAUTH_SANDBOX_CLIENT_ID",
    "OPEN_BANKING_OAUTH_SANDBOX_CLIENT_SECRET",
    "OPEN_BANKING_OAUTH_SANDBOX_REDIRECT_URI",
    "OPEN_BANKING_OAUTH_SANDBOX_TRANSACTIONS_URL",
    "OPEN_BANKING_OAUTH_SANDBOX_ACCOUNTS_URL",
]


def _config_value(name: str, default: str = "") -> str:
    if has_app_context():
        try:
            return str(current_app.config.get(name, default) or default).strip()
        except Exception:  # noqa: BLE001 - sandbox provider inputs are test-only and should degrade gracefully when malformed.
            return default
    return str(os.getenv(name) or default).strip()


def missing_config() -> list[str]:
    return [name for name in _REQUIRED_CONFIG_KEYS if not _config_value(name)]


def uses_pkce() -> bool:
    raw = _config_value("OPEN_BANKING_OAUTH_SANDBOX_USE_PKCE", "true").lower()
    return raw in {"1", "true", "yes", "on"}


def redirect_uri() -> str:
    return _config_value("OPEN_BANKING_OAUTH_SANDBOX_REDIRECT_URI")


def build_authorization_url(
    *,
    state: str,
    scopes: list[str] | None = None,
    code_challenge: str | None = None,
) -> str:
    missing = missing_config()
    if missing:
        raise RuntimeError(f"Provider config missing: {', '.join(missing)}")

    params = {
        "response_type": "code",
        "client_id": _config_value("OPEN_BANKING_OAUTH_SANDBOX_CLIENT_ID"),
        "redirect_uri": redirect_uri(),
        "scope": " ".join(scopes or ["transactions:read"]),
        "state": state,
    }
    if code_challenge:
        params["code_challenge"] = code_challenge
        params["code_challenge_method"] = "S256"

    return f"{_config_value('OPEN_BANKING_OAUTH_SANDBOX_AUTH_URL')}?{urlencode(params)}"


def catalog_entry() -> ProviderCatalogEntry:
    missing = missing_config()
    label = _config_value("OPEN_BANKING_OAUTH_SANDBOX_LABEL", DISPLAY_NAME) or DISPLAY_NAME
    if missing:
        status = "config_missing"
        notes = "Waiting for provider credentials and endpoint details."
    else:
        status = "authorization_bootstrap_ready"
        notes = (
            "Authorization URL and callback scaffolding are ready. Token exchange, "
            "account linking, and transaction mapping still need the provider-specific adapter."
        )

    return ProviderCatalogEntry(
        provider=PROVIDER_NAME,
        display_name=label,
        connect_mode="oauth_redirect",
        integration_status=status,
        ready=not missing,
        supports_sync_preview=False,
        default_limit=DEFAULT_LIMIT,
        missing_config=missing,
        supported_scopes=["transactions:read"],
        notes=notes,
        setup_doc=SETUP_DOC,
    )
