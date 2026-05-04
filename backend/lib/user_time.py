"""User-local timezone helpers.

Provides a single canonical location for converting UTC wall-clock time to a
user's local date and month boundary.  The analytics blueprint imports these
via routes/analytics/shared.py; other blueprints (goals, payday) import
directly from here.

Default timezone: Asia/Kuwait (UTC+3, no DST).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import current_app, has_app_context

DEFAULT_USER_TIMEZONE = "Asia/Kuwait"
_UTC = ZoneInfo("UTC")


def coerce_timezone(raw: str | None) -> ZoneInfo:
    """Return a ZoneInfo for *raw*, falling back to the default on invalid input."""
    name = str(raw or "").strip() or DEFAULT_USER_TIMEZONE
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        if has_app_context():
            current_app.logger.warning(
                "Invalid timezone %r; falling back to %s", name, DEFAULT_USER_TIMEZONE
            )
        return ZoneInfo(DEFAULT_USER_TIMEZONE)


def local_now(tz: ZoneInfo, *, now_utc: datetime | None = None) -> datetime:
    """Return the current datetime in *tz*, optionally overriding the UTC clock."""
    utc = now_utc or datetime.now(timezone.utc)
    if utc.tzinfo is None:
        utc = utc.replace(tzinfo=timezone.utc)
    return utc.astimezone(tz)


def local_today(tz: ZoneInfo, *, now_utc: datetime | None = None) -> date:
    """Return the current local date in *tz*."""
    return local_now(tz, now_utc=now_utc).date()


def local_month_key(tz: ZoneInfo, *, now_utc: datetime | None = None) -> str:
    """Return the current local month as ``"YYYY-MM"`` in *tz*."""
    d = local_today(tz, now_utc=now_utc)
    return f"{d.year}-{d.month:02d}"


def utc_today(*, now_utc: datetime | None = None) -> date:
    """Return the current UTC date (use only for TZ-neutral computations)."""
    return local_today(_UTC, now_utc=now_utc)
