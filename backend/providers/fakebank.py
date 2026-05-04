"""FakeBank provider for open-banking skeleton tests and demos.

Design guarantees:
- Deterministic pool of 50 rows per `connection_id`.
- Stateless pagination via integer-string cursor offsets.
- `provider_tx_id` format: `fakebank_{connection_id}_{index:04d}`.
"""

from __future__ import annotations

import hashlib
import json
import random
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from backend.providers.base import ProviderCatalogEntry
from backend.money_math import format_kd

PROVIDER_NAME = "fakebank"
DISPLAY_NAME = "FakeBank"
POOL_SIZE = 50
DEFAULT_LIMIT = 25
SETUP_DOC = "backend/providers/README.md"

_BASE_DATE = date(2026, 1, 1)

_DESCRIPTIONS = [
    "Coffee Shop",
    "Supermarket",
    "Petrol Station",
    "Pharmacy",
    "Restaurant",
    "Online Shopping",
    "Utility Bill",
    "Gym Membership",
    "Transport Fare",
    "Bookshop",
    "Electronics Store",
    "Bakery",
    "Car Wash",
    "Cinema Ticket",
    "Hospital Visit",
    "Takeaway Food",
    "Mobile Top-up",
    "Internet Subscription",
    "Clothes Shop",
    "Hardware Store",
]

_CATEGORY_HINTS = [
    "Food",
    "Groceries",
    "Transport",
    "Healthcare",
    "Entertainment",
    "Shopping",
    "Utilities",
]


@dataclass(frozen=True)
class ProviderRow:
    provider_tx_id: str
    date: date
    description: str
    amount_kd: Decimal
    category_hint: str | None = None
    merchant_hint: str | None = None

    def as_dict(self) -> dict[str, str | None]:
        return {
            "provider_tx_id": self.provider_tx_id,
            "date": self.date.isoformat(),
            "description": self.description,
            "amount_kd": format_kd(self.amount_kd),
            "category_hint": self.category_hint,
            "merchant_hint": self.merchant_hint,
        }

    @property
    def payload_hash(self) -> str:
        payload = json.dumps(
            self.as_dict(),
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _parse_cursor(cursor: str | None) -> int:
    if cursor in (None, ""):
        return 0
    try:
        offset = int(cursor)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid cursor. Expected an integer string offset.") from exc
    if offset < 0:
        raise ValueError("Invalid cursor. Offset cannot be negative.")
    return offset


def _make_pool(connection_id: int) -> list[ProviderRow]:
    """Return the deterministic 50-row pool for this connection_id."""
    seed = int(hashlib.md5(f"fakebank-pool-{connection_id}".encode("utf-8")).hexdigest(), 16)
    rng = random.Random(seed)
    pool: list[ProviderRow] = []
    for i in range(POOL_SIZE):
        provider_tx_id = f"fakebank_{connection_id}_{i:04d}"
        days_back = rng.randint(0, 59)
        tx_date = _BASE_DATE - timedelta(days=days_back)
        description = rng.choice(_DESCRIPTIONS)
        raw_millis = rng.randint(500, 49999)  # 0.500 to 49.999 KD
        amount_kd = Decimal(raw_millis) / Decimal(1000)
        category_hint = rng.choice(_CATEGORY_HINTS)
        merchant_hint = description[:64]
        pool.append(
            ProviderRow(
                provider_tx_id=provider_tx_id,
                date=tx_date,
                description=description,
                amount_kd=amount_kd,
                category_hint=category_hint,
                merchant_hint=merchant_hint,
            )
        )
    return pool


def make_pool(connection_id: int) -> list[ProviderRow]:
    """Public helper for tests and deterministic fixture assertions."""
    return _make_pool(connection_id)


def fetch_transactions(
    connection_id: int,
    cursor: str | None,
    limit: int = DEFAULT_LIMIT,
) -> tuple[list[ProviderRow], str | None]:
    """Return one page of transactions for the given connection."""
    offset = _parse_cursor(cursor)
    if limit <= 0:
        raise ValueError("limit must be > 0")
    limit = min(limit, POOL_SIZE)

    pool = _make_pool(connection_id)
    if offset >= len(pool):
        return [], None

    page = pool[offset: offset + limit]
    next_offset = offset + len(page)
    next_cursor = None if next_offset >= len(pool) else str(next_offset)
    return page, next_cursor


def catalog_entry() -> ProviderCatalogEntry:
    return ProviderCatalogEntry(
        provider=PROVIDER_NAME,
        display_name=DISPLAY_NAME,
        connect_mode="direct",
        integration_status="ready",
        ready=True,
        supports_sync_preview=True,
        default_limit=DEFAULT_LIMIT,
        missing_config=[],
        supported_scopes=["transactions:read"],
        notes="Deterministic local provider for development, demos, and tests.",
        setup_doc=SETUP_DOC,
    )
