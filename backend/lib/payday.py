"""Pay-period and income/expense classification helpers."""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlalchemy.sql import func


def _last_day_of_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _clamp_day_of_month(year: int, month: int, preferred_day: int) -> int:
    return max(1, min(int(preferred_day), _last_day_of_month(year, month)))


def _shift_month(year: int, month: int, delta_months: int) -> tuple[int, int]:
    idx = year * 12 + (month - 1) + int(delta_months)
    out_year, out_zero_based_month = divmod(idx, 12)
    return out_year, out_zero_based_month + 1


def income_category_filter_expr(category_name_col, is_income_col):
    """SQL expression for income-category matching with legacy name fallback."""
    return or_(
        is_income_col.is_(True),
        func.lower(func.coalesce(category_name_col, "")).like("income%"),
    )


def expense_category_filter_expr(category_name_col, is_income_col):
    """SQL expression for non-income categories with legacy name fallback."""
    return ~income_category_filter_expr(category_name_col, is_income_col)


def current_pay_period(
    payday_day: int | None,
    ref_date: date | None = None,
    *,
    tz: ZoneInfo | None = None,
) -> tuple[date, date]:
    """Return (cycle_start, cycle_end) for the pay period containing ref_date."""
    if ref_date is not None:
        ref = ref_date
    elif tz is not None:
        ref = datetime.now(timezone.utc).astimezone(tz).date()
    else:
        ref = datetime.now(timezone.utc).date()

    if payday_day is None:
        start = date(ref.year, ref.month, 1)
        end = date(ref.year, ref.month, _last_day_of_month(ref.year, ref.month))
        return start, end

    payday_day = int(payday_day)
    if payday_day < 1 or payday_day > 31:
        raise ValueError("payday_day must be between 1 and 31")

    this_month_payday = date(
        ref.year,
        ref.month,
        _clamp_day_of_month(ref.year, ref.month, payday_day),
    )

    if ref >= this_month_payday:
        start = this_month_payday
        next_year, next_month = _shift_month(ref.year, ref.month, 1)
        next_payday = date(
            next_year,
            next_month,
            _clamp_day_of_month(next_year, next_month, payday_day),
        )
        end = next_payday - timedelta(days=1)
        return start, end

    prev_year, prev_month = _shift_month(ref.year, ref.month, -1)
    prev_payday = date(
        prev_year,
        prev_month,
        _clamp_day_of_month(prev_year, prev_month, payday_day),
    )
    end = this_month_payday - timedelta(days=1)
    return prev_payday, end
