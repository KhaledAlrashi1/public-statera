"""Income aggregation helpers backed by categorized transactions."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.sql import func

from backend import db
from backend.lib.payday import income_category_filter_expr
from backend.models import Category, Transaction, UserProfile
from backend.money_math import quantize_kd, to_decimal


def calendar_month_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(int(year), int(month), 1)
    if int(month) == 12:
        end = date(int(year) + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(int(year), int(month) + 1, 1) - timedelta(days=1)
    return start, end


def detect_monthly_income_for_month(user_id: int, month: str) -> Decimal | None:
    """Return the month's categorized income total, or None when absent."""
    year, mon = int(month[:4]), int(month[5:7])
    month_start, month_end = calendar_month_bounds(year, mon)
    income_filter = income_category_filter_expr(Category.name, Category.is_income)
    total = (
        db.session.query(func.coalesce(func.sum(Transaction.amount_kd), 0))
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= month_start,
            Transaction.date <= month_end,
            income_filter,
        )
        .scalar()
    )
    total_decimal = to_decimal(total or 0)
    if total_decimal <= 0:
        return None
    return quantize_kd(total_decimal)


@dataclass
class IncomeResolution:
    amount_kd: Decimal | None
    # "detected_from_transactions" | "declared_in_profile" | None
    source: str | None


# INCOME RULE: All analytics that need income MUST call resolve_income_for_period().
# Never read UserProfile.monthly_income_kd directly in analytics routes.
# Precedence: detected from income transactions → declared in profile → None (income_not_set).
def resolve_income_for_period(user_id: int, month: str) -> IncomeResolution:
    """Single source of truth for a user's income for a given month.

    Precedence:
      1. Sum of income-categorized transactions for the month (auto-detected).
      2. UserProfile.monthly_income_kd declared by the user (fallback baseline).
      3. None — triggers income_not_set warning downstream.
    """
    detected = detect_monthly_income_for_month(user_id, month)
    if detected is not None:
        return IncomeResolution(amount_kd=detected, source="detected_from_transactions")

    profile = UserProfile.query.filter_by(user_id=user_id).first()
    if profile and profile.monthly_income_kd and profile.monthly_income_kd > 0:
        declared = quantize_kd(profile.monthly_income_kd)
        return IncomeResolution(amount_kd=declared, source="declared_in_profile")

    return IncomeResolution(amount_kd=None, source=None)
