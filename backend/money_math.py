"""Shared money-math helpers for KWD precision rules."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import TypeAlias

KWD_QUANT = Decimal("0.001")
MoneyLike: TypeAlias = Decimal | int | float | str | None


def to_decimal(value: MoneyLike) -> Decimal:
    """Convert value to Decimal without introducing float precision noise."""
    if isinstance(value, Decimal):
        return value
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def quantize_kd(value: MoneyLike) -> Decimal:
    """Quantize a value to KWD precision (3 decimal places)."""
    return to_decimal(value).quantize(KWD_QUANT, rounding=ROUND_HALF_UP)


def format_kd(value: MoneyLike) -> str:
    """Return a canonical 3-decimal KWD string."""
    return f"{quantize_kd(value):.3f}"


def is_quantized_kd(value: MoneyLike) -> bool:
    """Return True if value is already quantized to 3 decimal places."""
    dec = to_decimal(value)
    return dec == dec.quantize(KWD_QUANT, rounding=ROUND_HALF_UP)


def to_display_float(value: MoneyLike, *, places: Decimal = KWD_QUANT) -> float:
    """Convert to float for display/JSON serialization only. Always quantizes first.

    Never use this for intermediate calculations — use Decimal throughout.
    Only call this at the final JSON serialization boundary.
    """
    return float(to_decimal(value).quantize(places, rounding=ROUND_HALF_UP))
