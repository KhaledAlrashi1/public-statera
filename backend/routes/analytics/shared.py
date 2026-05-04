"""Shared analytics helpers and constants."""

from __future__ import annotations

import calendar
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy import or_

from backend.lib.user_time import (
    DEFAULT_USER_TIMEZONE as _DEFAULT_ANALYTICS_TIMEZONE,
    coerce_timezone as _coerce_timezone_impl,
    local_now as _local_now,
    local_today as _current_local_date_impl,
    local_month_key as _local_month_key_impl,
)
from backend.lib.validation import ValidationError
from backend.models import Transaction, UserProfile
from backend.money_math import to_display_float

_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_ALLOWED_TXN_SOURCES = {"manual", "bank_import", "csv_import"}
_DASHBOARD_CACHE_TTL_SECONDS = 300
_MONEY_QUANT = Decimal("0.001")
_PERCENT_QUANT = Decimal("0.1")
_UTC_ZONE = ZoneInfo("UTC")
_RECURRING_SUBSCRIPTION_HINTS = (
    "subscription",
    "subscriptions",
    "netflix",
    "spotify",
    "apple",
    "prime",
    "youtube",
    "adobe",
    "membership",
    "streaming",
    "software",
    "icloud",
)
_RECURRING_UTILITY_HINTS = (
    "utility",
    "utilities",
    "water",
    "electric",
    "electricity",
    "internet",
    "wifi",
    "phone",
    "mobile",
    "telecom",
    "broadband",
    "mew",
    "ooredoo",
    "stc",
    "viva",
    "zain",
    "kptc",
    "knpc",
)
_RECURRING_LOAN_HINTS = (
    "loan",
    "loans",
    "installment",
    "installments",
    "mortgage",
    "finance",
    "credit card",
    "minimum payment",
    "debt",
)


def _build_month_window(end_year: int, end_month: int, months: int) -> list[str]:
    out_desc: list[str] = []
    year, month = end_year, end_month
    for _ in range(months):
        out_desc.append(f"{year}-{month:02d}")
        month -= 1
        if month < 1:
            month = 12
            year -= 1
    return list(reversed(out_desc))


def _month_keys_between(start_date: date, end_date: date) -> list[str]:
    if end_date < start_date:
        return []
    keys: list[str] = []
    year, month = start_date.year, start_date.month
    while (year, month) <= (end_date.year, end_date.month):
        keys.append(f"{year}-{month:02d}")
        month += 1
        if month > 12:
            month = 1
            year += 1
    return keys


def _parse_bool_query(raw_value: str | None) -> bool:
    return str(raw_value or "").strip().lower() in {"1", "true", "yes", "on"}


def _parse_source_query(raw_value: str | None) -> str | None:
    value = str(raw_value or "").strip().lower()
    if not value:
        return None
    if value not in _ALLOWED_TXN_SOURCES:
        raise ValidationError("source must be one of: manual, bank_import, csv_import")
    return value


def _source_filter_expr(source: str):
    if source == "manual":
        return or_(Transaction.source == "manual", Transaction.source.is_(None))
    return Transaction.source == source


def _month_key(value: date) -> str:
    return f"{value.year}-{value.month:02d}"


def _coerce_timezone(raw_value: str | None) -> ZoneInfo:
    return _coerce_timezone_impl(raw_value)


def _user_timezone(user_id: int) -> ZoneInfo:
    profile = UserProfile.query.filter_by(user_id=int(user_id)).first()
    return _coerce_timezone(profile.timezone if profile else None)


def _current_local_datetime(tz: ZoneInfo, *, now_utc: datetime | None = None) -> datetime:
    return _local_now(tz, now_utc=now_utc)


def _current_local_date(tz: ZoneInfo, *, now_utc: datetime | None = None) -> date:
    return _current_local_date_impl(tz, now_utc=now_utc)


def _current_month_key(tz: ZoneInfo, *, now_utc: datetime | None = None) -> str:
    return _local_month_key_impl(tz, now_utc=now_utc)


def _current_month_key_utc() -> str:
    return _current_month_key(_UTC_ZONE)


def _week_bounds(ref_date: date) -> tuple[date, date]:
    start = ref_date - timedelta(days=ref_date.weekday())
    end = start + timedelta(days=6)
    return start, end


def _clamped_month_day(year: int, month: int, preferred_day: int) -> date:
    day = max(1, min(preferred_day, calendar.monthrange(year, month)[1]))
    return date(year, month, day)


def _days_until_payday(today_date: date, payday_day: int | None) -> int | None:
    if payday_day is None:
        return None

    this_month_payday = _clamped_month_day(today_date.year, today_date.month, payday_day)
    if today_date <= this_month_payday:
        return (this_month_payday - today_date).days

    next_year = today_date.year + (1 if today_date.month == 12 else 0)
    next_month = 1 if today_date.month == 12 else today_date.month + 1
    next_month_payday = _clamped_month_day(next_year, next_month, payday_day)
    return (next_month_payday - today_date).days


def _safe_to_spend_cache_key(user_id: int, month: str) -> str:
    return f"safe_to_spend:{int(user_id)}:{month}"


def _rounded_number(value: object, *, places: Decimal = _MONEY_QUANT) -> float:
    return to_display_float(value or 0, places=places)


def _rounded_percent(numerator: Decimal, denominator: Decimal) -> float:
    if denominator <= 0:
        return 0.0
    return to_display_float((numerator / denominator) * Decimal("100"), places=_PERCENT_QUANT)


def _confidence_from_variance(max_deviation: Decimal, evidence_months: int) -> str:
    if max_deviation <= Decimal("0.02") and evidence_months >= 3:
        return "high"
    if max_deviation <= Decimal("0.05"):
        return "medium"
    return "low"


def _classify_recurring_frequency(median_interval_days: int) -> str:
    if 28 <= median_interval_days <= 32:
        return "monthly"
    if 13 <= median_interval_days <= 15:
        return "bi-weekly"
    if 6 <= median_interval_days <= 8:
        return "weekly"
    return "irregular"


def _matches_recurring_hint(haystacks: list[str], hints: tuple[str, ...]) -> bool:
    for text in haystacks:
        if not text:
            continue
        if any(hint in text for hint in hints):
            return True
    return False


def _classify_recurring_group(
    *,
    category_name: str | None,
    merchant_name: str | None,
    display_name: str,
) -> str:
    haystacks = [
        " ".join(str(category_name or "").lower().split()),
        " ".join(str(merchant_name or "").lower().split()),
        " ".join(str(display_name or "").lower().split()),
    ]
    if _matches_recurring_hint(haystacks, _RECURRING_LOAN_HINTS):
        return "Loan Payments"
    if _matches_recurring_hint(haystacks, _RECURRING_UTILITY_HINTS):
        return "Utilities"
    if _matches_recurring_hint(haystacks, _RECURRING_SUBSCRIPTION_HINTS):
        return "Subscriptions"
    return "Other"


def _interval_variance_ratio(intervals: list[int]) -> Decimal:
    if not intervals:
        return Decimal("1")
    if len(intervals) == 1:
        return Decimal("0")
    average = Decimal(sum(intervals)) / Decimal(len(intervals))
    if average <= 0:
        return Decimal("1")
    return max(abs(Decimal(days) - average) / average for days in intervals)


def _confidence_from_interval_variance(max_deviation: Decimal) -> str:
    if max_deviation <= Decimal("0.10"):
        return "high"
    if max_deviation <= Decimal("0.20"):
        return "medium"
    return "low"


def _dashboard_snapshot_months_count() -> int:
    try:
        months = int(current_app.config.get("DASHBOARD_SNAPSHOT_MONTHS", 24))
    except Exception:  # noqa: BLE001 - config is user-supplied and analytics should fall back to a safe default.
        months = 24
    return max(1, min(months, 60))
