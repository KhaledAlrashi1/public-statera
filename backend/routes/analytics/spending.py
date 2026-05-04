"""Spending-focused analytics payload builders."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.sql import func

from backend import db
from backend.constants import UNCAT_NAME
from backend.db_compat import month_bucket
from backend.lib.payday import current_pay_period, expense_category_filter_expr
from backend.models import Category, Merchant, Transaction, UserProfile
from backend.money_math import to_decimal

from .shared import (
    _build_month_window,
    _rounded_number,
    _source_filter_expr,
)


def _build_spend_by_category_items(user_id: int) -> dict[str, float]:
    rows = (
        db.session.query(
            func.coalesce(Category.name, UNCAT_NAME).label("category"),
            func.sum(Transaction.amount_kd).label("total"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(expense_category_filter_expr(Category.name, Category.is_income))
        .group_by(func.coalesce(Category.name, UNCAT_NAME))
        .order_by(func.sum(Transaction.amount_kd).desc(), func.coalesce(Category.name, UNCAT_NAME).asc())
        .all()
    )
    return {category: _rounded_number(total) for category, total in rows}


def _build_spend_by_month_items(user_id: int) -> list[dict[str, object]]:
    ym_expr = month_bucket(Transaction.date)
    rows = (
        db.session.query(ym_expr.label("ym"), func.sum(Transaction.amount_kd))
        .select_from(Transaction)
        .filter(Transaction.user_id == user_id)
        .group_by(ym_expr)
        .order_by(ym_expr)
        .all()
    )
    return [{"month": ym_value, "total_kd": _rounded_number(total)} for ym_value, total in rows]


def _build_expense_breakdown_payload(
    *,
    user_id: int,
    dimension: str,
    range_key: str,
    month: str,
    limit: int,
    source: str | None,
) -> dict[str, object]:
    end_year, end_month = int(month[:4]), int(month[5:7])
    month_keys = _build_month_window(end_year, end_month, 12)
    ym_expr = month_bucket(Transaction.date)

    query = (
        db.session.query(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .outerjoin(Merchant, Transaction.merchant_id == Merchant.id)
        .filter(Transaction.user_id == user_id)
        .filter(expense_category_filter_expr(Category.name, Category.is_income))
    )

    if range_key == "month":
        query = query.filter(ym_expr == month)
    elif range_key == "12m":
        query = query.filter(ym_expr.in_(month_keys))
    if source:
        query = query.filter(_source_filter_expr(source))

    scope_total = to_decimal(query.with_entities(func.sum(Transaction.amount_kd)).scalar() or 0)

    if dimension == "category":
        name_expr = func.coalesce(Category.name, UNCAT_NAME).label("name")
        rows = (
            query.with_entities(name_expr, func.sum(Transaction.amount_kd).label("total"))
            .group_by(name_expr)
            .order_by(func.sum(Transaction.amount_kd).desc(), name_expr.asc())
            .limit(limit)
            .all()
        )
        items = [{"name": name or UNCAT_NAME, "amount_kd": _rounded_number(total)} for name, total in rows]
    elif dimension == "merchant":
        name_expr = func.coalesce(Merchant.name, "Unknown Merchant").label("name")
        rows = (
            query.with_entities(name_expr, func.sum(Transaction.amount_kd).label("total"))
            .group_by(name_expr)
            .order_by(func.sum(Transaction.amount_kd).desc(), name_expr.asc())
            .limit(limit)
            .all()
        )
        items = [{"name": name or "Unknown Merchant", "amount_kd": _rounded_number(total)} for name, total in rows]
    else:
        name_key = func.lower(func.trim(Transaction.name)).label("name_key")
        rows = (
            query.with_entities(
                name_key,
                func.min(Transaction.name).label("name"),
                func.sum(Transaction.amount_kd).label("total"),
            )
            .filter(func.length(func.trim(Transaction.name)) > 0)
            .group_by(name_key)
            .order_by(func.sum(Transaction.amount_kd).desc(), func.min(Transaction.name).asc())
            .limit(limit)
            .all()
        )
        items = [{"name": name or "Unnamed", "amount_kd": _rounded_number(total)} for _key, name, total in rows]

    return {
        "dimension": dimension,
        "range": range_key,
        "month": month,
        "source": source,
        "window_months": 1 if range_key == "month" else 12 if range_key == "12m" else None,
        "total_kd": _rounded_number(scope_total),
        "items": items,
    }


def _build_expense_merchant_trend_payload(
    *,
    user_id: int,
    merchant: str,
    months: int,
    until: str | None,
    current_month: str | None = None,
) -> dict[str, object]:
    if until:
        end_year, end_month = int(until[:4]), int(until[5:7])
    else:
        resolved_month = (current_month or "").strip()
        if resolved_month:
            end_year, end_month = int(resolved_month[:4]), int(resolved_month[5:7])
        else:
            now = datetime.now(timezone.utc)
            end_year, end_month = now.year, now.month

    month_keys = _build_month_window(end_year, end_month, months)
    ym_expr = month_bucket(Transaction.date)
    query = (
        db.session.query(ym_expr.label("ym"), func.sum(Transaction.amount_kd).label("total"))
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .outerjoin(Merchant, Transaction.merchant_id == Merchant.id)
        .filter(Transaction.user_id == user_id)
        .filter(expense_category_filter_expr(Category.name, Category.is_income))
        .filter(ym_expr.in_(month_keys))
    )
    if merchant.lower() == "unknown merchant":
        query = query.filter(Merchant.name.is_(None))
    else:
        query = query.filter(func.lower(Merchant.name) == merchant.lower())

    rows = query.group_by(ym_expr).all()
    by_month = {str(ym_value or ""): _rounded_number(total) for ym_value, total in rows}
    return {
        "merchant": merchant,
        "months": month_keys,
        "series": [{"month": month_key, "total_kd": by_month.get(month_key, 0.0)} for month_key in month_keys],
    }


def _build_budget_metrics_payload(
    *,
    user_id: int,
    month: str,
    range_key: str,
    cycle_enabled: bool,
    today_date: date | None = None,
) -> dict[str, object]:
    year, month_number = int(month[:4]), int(month[5:7])
    cycle_start: date | None = None
    cycle_end: date | None = None
    if cycle_enabled:
        profile = UserProfile.query.filter_by(user_id=user_id).first()
        cycle_reference = date(year, month_number, 1)
        cycle_start, cycle_end = current_pay_period(
            profile.payday_day if profile else None,
            cycle_reference,
        )

    previous_month_keys = []
    previous_year, previous_month = year, month_number
    for _ in range(12):
        previous_month -= 1
        if previous_month < 1:
            previous_month = 12
            previous_year -= 1
        previous_month_keys.append(f"{previous_year}-{previous_month:02d}")

    ym_expr = month_bucket(Transaction.date)
    expense_filter = expense_category_filter_expr(Category.name, Category.is_income)

    monthly_query = (
        db.session.query(Category.name.label("cat"), func.sum(Transaction.amount_kd).label("total"))
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(expense_filter)
    )
    if cycle_enabled and cycle_start and cycle_end:
        monthly_query = monthly_query.filter(Transaction.date >= cycle_start).filter(Transaction.date <= cycle_end)
    else:
        monthly_query = monthly_query.filter(ym_expr == month)
    monthly_rows = monthly_query.group_by(Category.name).all()
    spent_by_category = {(category_name or UNCAT_NAME): _rounded_number(total) for category_name, total in monthly_rows}

    if range_key == "month":
        range_spent_by_category = dict(spent_by_category)
    else:
        effective_today = today_date or datetime.now(timezone.utc).date()
        range_query = (
            db.session.query(Category.name.label("cat"), func.sum(Transaction.amount_kd).label("total"))
            .select_from(Transaction)
            .outerjoin(Category, Transaction.category_id == Category.id)
            .filter(Transaction.user_id == user_id)
            .filter(expense_filter)
        )
        if range_key in {"30", "90", "365"}:
            cutoff = effective_today - timedelta(days=int(range_key))
            range_query = range_query.filter(Transaction.date >= cutoff)

        range_rows = range_query.group_by(Category.name).all()
        range_spent_by_category = {
            (category_name or UNCAT_NAME): _rounded_number(total)
            for category_name, total in range_rows
        }

    previous_rows = (
        db.session.query(
            Category.name.label("cat"),
            ym_expr.label("ym"),
            func.sum(Transaction.amount_kd).label("total"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(ym_expr.in_(previous_month_keys))
        .filter(expense_filter)
        .group_by(Category.name, ym_expr)
        .all()
    )
    avg12_sum_by_category: dict[str, Decimal] = {}
    for category_name, _month_key, total in previous_rows:
        category = category_name or UNCAT_NAME
        avg12_sum_by_category[category] = avg12_sum_by_category.get(category, Decimal("0")) + to_decimal(total or 0)

    avg12_by_category = {
        category: _rounded_number(total / Decimal("12"))
        for category, total in avg12_sum_by_category.items()
    }
    return {
        "month": month,
        "range": range_key,
        "spent_by_category": spent_by_category,
        "range_spent_by_category": range_spent_by_category,
        "avg12_by_category": avg12_by_category,
        "cycle_enabled": cycle_enabled,
        "cycle_start": cycle_start.isoformat() if cycle_enabled and cycle_start else None,
        "cycle_end": cycle_end.isoformat() if cycle_enabled and cycle_end else None,
    }
