"""Dashboard metrics computation and persisted snapshot helpers."""

from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import date, datetime, timezone

from flask import current_app
from flask_login import current_user
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.sql import func

from backend import db
from backend.constants import UNCAT_NAME
from backend.db_compat import month_bucket
from backend.lib.payday import income_category_filter_expr
from backend.lib.validation import ValidationError
from backend.models import Category, DashboardSnapshot, Transaction
from backend.money_math import to_decimal
from backend.product_events import record_event_daily

from .shared import (
    _MONTH_RE,
    _build_month_window,
    _current_month_key_utc,
    _dashboard_snapshot_months_count,
    _month_keys_between,
    _rounded_number,
)


class AnalyticsComputationTimeoutError(TimeoutError):
    """Raised when analytics work exceeds the configured request timeout."""


def _analytics_timeout_seconds() -> int:
    try:
        seconds = int(current_app.config.get("ANALYTICS_COMPUTE_TIMEOUT_SECONDS", 10))
    except Exception:  # noqa: BLE001 - config coercion failures should fall back to a conservative timeout.
        seconds = 10
    return max(1, min(seconds, 60))


def _analytics_timeout_milliseconds(seconds: int) -> int:
    return max(1, int(seconds or 10)) * 1000


def _is_statement_timeout_error(exc: BaseException) -> bool:
    if not isinstance(exc, DBAPIError):
        return False

    original = getattr(exc, "orig", None)
    sqlstate = (
        getattr(original, "pgcode", None)
        or getattr(original, "sqlstate", None)
        or getattr(exc, "code", None)
    )
    if sqlstate == "57014":
        return True

    message = f"{exc} {original or ''}".lower()
    return "statement timeout" in message or "canceling statement due to statement timeout" in message


@contextmanager
def _analytics_timeout_guard(seconds: int):
    if db.engine.dialect.name != "postgresql":
        yield
        return

    timeout_ms = _analytics_timeout_milliseconds(seconds)
    db.session.execute(text(f"SET LOCAL statement_timeout = {timeout_ms}"))
    try:
        yield
    except DBAPIError as exc:
        if _is_statement_timeout_error(exc):
            raise AnalyticsComputationTimeoutError("Analytics computation timed out.") from exc
        raise


def _record_dashboard_open_event() -> None:
    try:
        record_event_daily(
            "app_opened",
            current_user.id,
            properties={"source": "dashboard_metrics"},
            commit=True,
        )
    except Exception:  # noqa: BLE001 - analytics responses should survive product-analytics event failures.
        db.session.rollback()
        current_app.logger.exception(
            "Failed to record app_opened event for user_id=%s",
            current_user.id,
        )


def _dashboard_snapshot_eligibility(
    *,
    months: int,
    end_year: int,
    end_month: int,
    cycle_enabled: bool,
    current_month_key: str | None = None,
) -> tuple[bool, str]:
    window_end_month = f"{end_year}-{end_month:02d}"
    eligible = (
        (not cycle_enabled)
        and months == _dashboard_snapshot_months_count()
        and window_end_month == (current_month_key or _current_month_key_utc())
    )
    return eligible, window_end_month


def _dashboard_snapshot_payload(snapshot: DashboardSnapshot) -> dict[str, object] | None:
    try:
        payload = snapshot.to_payload()
    except Exception:  # noqa: BLE001 - corrupt snapshot JSON should be ignored and recomputed.
        current_app.logger.warning(
            "Invalid dashboard snapshot payload for snapshot_id=%s user_id=%s",
            snapshot.id,
            snapshot.user_id,
            exc_info=True,
        )
        return None

    months = payload.get("months")
    monthly = payload.get("monthly")
    expense_by_category = payload.get("expense_by_category")
    if not isinstance(months, list) or not isinstance(monthly, list) or not isinstance(expense_by_category, dict):
        current_app.logger.warning(
            "Dashboard snapshot payload failed shape validation for snapshot_id=%s user_id=%s",
            snapshot.id,
            snapshot.user_id,
        )
        return None
    return payload


def _load_dashboard_snapshot_payload(
    *,
    user_id: int,
    months_count: int,
    window_end_month: str,
) -> dict[str, object] | None:
    snapshot = (
        DashboardSnapshot.query
        .filter(DashboardSnapshot.user_id == int(user_id))
        .filter(DashboardSnapshot.months_count == int(months_count))
        .filter(DashboardSnapshot.window_end_month == window_end_month)
        .order_by(DashboardSnapshot.computed_at.desc(), DashboardSnapshot.id.desc())
        .first()
    )
    if snapshot is None:
        return None
    return _dashboard_snapshot_payload(snapshot)


def _dashboard_snapshot_computed_at(
    *,
    user_id: int,
    months_count: int,
    window_end_month: str,
) -> str | None:
    snapshot = (
        DashboardSnapshot.query
        .filter(DashboardSnapshot.user_id == int(user_id))
        .filter(DashboardSnapshot.months_count == int(months_count))
        .filter(DashboardSnapshot.window_end_month == window_end_month)
        .order_by(DashboardSnapshot.computed_at.desc(), DashboardSnapshot.id.desc())
        .first()
    )
    if snapshot is None or snapshot.computed_at is None:
        return None
    return snapshot.computed_at.isoformat()


def _compute_dashboard_metrics_payload(
    *,
    user_id: int,
    months: int,
    end_year: int,
    end_month: int,
    cycle_enabled: bool,
    cycle_start: date | None = None,
    cycle_end: date | None = None,
) -> dict[str, object]:
    if cycle_enabled and cycle_start and cycle_end:
        month_keys = _month_keys_between(cycle_start, cycle_end)
    else:
        month_keys = _build_month_window(end_year, end_month, months)

    ym_expr = month_bucket(Transaction.date)
    income_flag_expr = income_category_filter_expr(Category.name, Category.is_income)
    rows_query = (
        db.session.query(
            ym_expr.label("ym"),
            Category.name.label("cat"),
            func.sum(Transaction.amount_kd).label("total"),
            income_flag_expr.label("is_income"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == int(user_id))
    )
    if cycle_enabled and cycle_start and cycle_end:
        rows_query = rows_query.filter(Transaction.date >= cycle_start).filter(Transaction.date <= cycle_end)
    else:
        rows_query = rows_query.filter(ym_expr.in_(month_keys))
    rows = rows_query.group_by(ym_expr, Category.name, income_flag_expr).all()

    income_by_month = {month_key: to_decimal(0) for month_key in month_keys}
    expense_by_month = {month_key: to_decimal(0) for month_key in month_keys}
    expense_by_category: dict[str, dict[str, object]] = {month_key: {} for month_key in month_keys}

    for ym_val, cat_name, total, is_income_flag in rows:
        month_key = str(ym_val or "")
        if month_key not in income_by_month:
            continue

        amount = to_decimal(total or 0)
        category = cat_name or UNCAT_NAME
        if is_income_flag:
            income_by_month[month_key] = income_by_month[month_key] + amount
        else:
            expense_by_month[month_key] = expense_by_month[month_key] + amount
            current = to_decimal(expense_by_category[month_key].get(category, 0))
            expense_by_category[month_key][category] = current + amount

    monthly = [
        {
            "month": month_key,
            "income_kd": _rounded_number(income_by_month.get(month_key, 0)),
            "expense_kd": _rounded_number(expense_by_month.get(month_key, 0)),
        }
        for month_key in month_keys
    ]
    expense_map = {
        month_key: {
            category: _rounded_number(amount)
            for category, amount in expense_by_category.get(month_key, {}).items()
        }
        for month_key in month_keys
    }
    return {
        "months": month_keys,
        "monthly": monthly,
        "expense_by_category": expense_map,
        "cycle_enabled": cycle_enabled,
        "cycle_start": cycle_start.isoformat() if cycle_enabled and cycle_start else None,
        "cycle_end": cycle_end.isoformat() if cycle_enabled and cycle_end else None,
    }


def _persist_dashboard_snapshot(
    *,
    user_id: int,
    months_count: int,
    window_end_month: str,
    payload: dict[str, object],
) -> DashboardSnapshot:
    snapshot = (
        DashboardSnapshot.query
        .filter(DashboardSnapshot.user_id == int(user_id))
        .filter(DashboardSnapshot.months_count == int(months_count))
        .filter(DashboardSnapshot.window_end_month == window_end_month)
        .first()
    )
    if snapshot is None:
        snapshot = DashboardSnapshot(
            user_id=int(user_id),
            months_count=int(months_count),
            window_end_month=window_end_month,
        )
        db.session.add(snapshot)

    snapshot.months_json = json.dumps(payload.get("months") or [], separators=(",", ":"), ensure_ascii=True)
    snapshot.monthly_json = json.dumps(payload.get("monthly") or [], separators=(",", ":"), ensure_ascii=True)
    snapshot.expense_by_category_json = json.dumps(
        payload.get("expense_by_category") or {},
        separators=(",", ":"),
        ensure_ascii=True,
    )
    snapshot.computed_at = datetime.now(timezone.utc)
    db.session.commit()
    return snapshot


def rebuild_dashboard_snapshot(
    *,
    user_id: int,
    months_count: int | None = None,
    window_end_month: str | None = None,
) -> DashboardSnapshot:
    target_months = int(months_count or _dashboard_snapshot_months_count())
    target_window = (window_end_month or _current_month_key_utc()).strip()
    if not _MONTH_RE.fullmatch(target_window):
        raise ValidationError("window_end_month must be in YYYY-MM format")

    end_year, end_month = int(target_window[:4]), int(target_window[5:7])
    payload = _compute_dashboard_metrics_payload(
        user_id=int(user_id),
        months=target_months,
        end_year=end_year,
        end_month=end_month,
        cycle_enabled=False,
    )
    return _persist_dashboard_snapshot(
        user_id=int(user_id),
        months_count=target_months,
        window_end_month=target_window,
        payload=payload,
    )
