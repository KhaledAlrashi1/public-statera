"""Safe-to-spend and digest-oriented analytics helpers."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import func

from backend import db
from backend.lib.cache import cache_get, cache_set
from backend.lib.income import calendar_month_bounds, resolve_income_for_period
from backend.lib.payday import expense_category_filter_expr
from backend.lib.savings_goals import goal_monthly_commitment
from backend.models import Budget, Category, DebtAccount, SavingsGoal, Transaction
from backend.money_math import format_kd, to_decimal

from .shared import _current_local_date, _safe_to_spend_cache_key


def _sum_expense_between(user_id: int, start_date: date, end_date: date) -> Decimal:
    if end_date < start_date:
        return Decimal("0")
    return to_decimal(
        db.session.query(func.coalesce(func.sum(Transaction.amount_kd), 0))
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.date >= start_date)
        .filter(Transaction.date <= end_date)
        .filter(expense_category_filter_expr(Category.name, Category.is_income))
        .scalar()
    )


def _budget_amounts_for_month(user_id: int, month: str) -> tuple[Decimal, dict[str, Decimal]]:
    rows = (
        db.session.query(Budget.amount_kd, Category.name)
        .outerjoin(Category, Budget.category_id == Category.id)
        .filter(Budget.user_id == user_id)
        .filter(Budget.month == month)
        .all()
    )

    total_budget = Decimal("0")
    amounts_by_category: dict[str, Decimal] = {}
    for amount_raw, category_name in rows:
        amount = to_decimal(amount_raw)
        total_budget += amount
        key = str(category_name or "").strip().lower()
        if key:
            amounts_by_category[key] = amounts_by_category.get(key, Decimal("0")) + amount

    return total_budget, amounts_by_category


def _savings_goal_reserve_for_safe_to_spend(
    user_id: int,
    *,
    today: date,
    budget_amounts_by_category: dict[str, Decimal],
) -> dict[str, object]:
    active_goals = (
        SavingsGoal.query
        .options(joinedload(SavingsGoal.linked_category_rel))
        .filter(SavingsGoal.user_id == user_id)
        .filter(SavingsGoal.is_active.is_(True))
        .all()
    )

    goal_monthly_by_category: dict[str, Decimal] = {}
    savings_goal_monthly_total = Decimal("0")
    savings_goal_unlinked_total = Decimal("0")
    savings_goal_unscheduled_count = 0

    for goal in active_goals:
        commitment = goal_monthly_commitment(goal, today=today)
        monthly_commitment = to_decimal(commitment.get("monthly_commitment_kd") or 0)
        savings_goal_monthly_total += monthly_commitment
        if commitment.get("source") == "unscheduled":
            savings_goal_unscheduled_count += 1
        if monthly_commitment <= 0:
            continue
        linked_category_name = goal.linked_category_rel.name if goal.linked_category_rel else ""
        linked_category_key = str(linked_category_name or "").strip().lower()
        if linked_category_key:
            goal_monthly_by_category[linked_category_key] = (
                goal_monthly_by_category.get(linked_category_key, Decimal("0")) + monthly_commitment
            )
        else:
            savings_goal_unlinked_total += monthly_commitment

    savings_goal_budget_covered = Decimal("0")
    savings_goal_reserve = savings_goal_unlinked_total
    for category_key, monthly_commitment in goal_monthly_by_category.items():
        covered_amount = min(monthly_commitment, budget_amounts_by_category.get(category_key, Decimal("0")))
        savings_goal_budget_covered += covered_amount
        savings_goal_reserve += monthly_commitment - covered_amount

    return {
        "count": len(active_goals),
        "unscheduled_count": savings_goal_unscheduled_count,
        "monthly_total_kd": savings_goal_monthly_total,
        "budget_covered_kd": savings_goal_budget_covered,
        "reserve_kd": savings_goal_reserve,
    }


def _build_safe_to_spend_payload(
    user_id: int,
    month: str,
    *,
    today_date: date | None = None,
    tz: ZoneInfo | None = None,
) -> dict[str, object]:
    year, month_number = int(month[:4]), int(month[5:7])
    cycle_start, cycle_end = calendar_month_bounds(year, month_number)
    cycle_days = (cycle_end - cycle_start).days + 1

    today = today_date or (_current_local_date(tz) if tz is not None else datetime.now(timezone.utc).date())
    if today < cycle_start:
        days_elapsed = 0
        days_remaining = cycle_days
        spend_window_end = None
    elif today > cycle_end:
        days_elapsed = cycle_days
        days_remaining = 0
        spend_window_end = cycle_end
    else:
        days_elapsed = (today - cycle_start).days + 1
        days_remaining = (cycle_end - today).days
        spend_window_end = today

    income_resolution = resolve_income_for_period(user_id, month)
    monthly_income = income_resolution.amount_kd
    income_auto_detected = income_resolution.source == "detected_from_transactions"
    income_source = income_resolution.source

    total_budget, budget_amounts_by_category = _budget_amounts_for_month(user_id, month)
    savings_goal_summary = _savings_goal_reserve_for_safe_to_spend(
        user_id,
        today=today,
        budget_amounts_by_category=budget_amounts_by_category,
    )
    savings_goal_count = int(savings_goal_summary["count"])
    savings_goal_unscheduled_count = int(savings_goal_summary["unscheduled_count"])
    savings_goal_monthly_total = to_decimal(savings_goal_summary["monthly_total_kd"])
    savings_goal_budget_covered = to_decimal(savings_goal_summary["budget_covered_kd"])
    savings_goal_reserve = to_decimal(savings_goal_summary["reserve_kd"])

    debt_row = (
        db.session.query(
            func.coalesce(func.sum(DebtAccount.minimum_payment_kd), 0),
            func.count(DebtAccount.id),
        )
        .filter(DebtAccount.user_id == user_id)
        .filter(DebtAccount.is_active.is_(True))
        .first()
    )
    debt_minimum_total = to_decimal(debt_row[0] if debt_row else 0)
    debt_account_count = int(debt_row[1] if debt_row else 0)

    actual_spend = Decimal("0")
    if spend_window_end is not None and spend_window_end >= cycle_start:
        actual_spend = _sum_expense_between(user_id, cycle_start, spend_window_end)

    committed = total_budget + debt_minimum_total + savings_goal_reserve
    income_for_calc = monthly_income if monthly_income is not None else Decimal("0")
    commitments_over_cap = income_for_calc > 0 and committed > (income_for_calc * Decimal("0.40"))

    remaining_raw = income_for_calc - committed - actual_spend
    remaining_budget = remaining_raw if remaining_raw > 0 else Decimal("0")
    daily_rate = remaining_budget / Decimal(max(days_remaining, 1))

    warnings: list[str] = []
    if monthly_income is None:
        warnings.append("income_not_set")
    if total_budget <= 0:
        warnings.append("budgets_not_set")
    if debt_account_count == 0:
        warnings.append("debts_not_set_optional")
    if savings_goal_unscheduled_count > 0:
        warnings.append("savings_goals_unscheduled_optional")
    if commitments_over_cap:
        warnings.append("commitments_over_40pct_cap")

    return {
        "month": month,
        "cycle_start": cycle_start.isoformat(),
        "cycle_end": cycle_end.isoformat(),
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
        "monthly_income_kd": format_kd(monthly_income) if monthly_income is not None else None,
        "income_auto_detected": income_auto_detected,
        "income_source": income_source,
        "total_budget_kd": format_kd(total_budget),
        "debt_minimum_total_kd": format_kd(debt_minimum_total),
        "savings_goal_count": savings_goal_count,
        "savings_goal_unscheduled_count": savings_goal_unscheduled_count,
        "savings_goal_monthly_total_kd": format_kd(savings_goal_monthly_total),
        "savings_goal_budget_covered_kd": format_kd(savings_goal_budget_covered),
        "savings_goal_reserve_kd": format_kd(savings_goal_reserve),
        "committed_kd": format_kd(committed),
        "committed_breakdown_kd": {
            "budget_allocations": format_kd(total_budget),
            "debt_minimums": format_kd(debt_minimum_total),
            "savings_goal_reserve": format_kd(savings_goal_reserve),
            "savings_goal_budget_covered": format_kd(savings_goal_budget_covered),
        },
        "actual_spend_kd": format_kd(actual_spend),
        "remaining_budget_kd": format_kd(remaining_budget),
        "daily_rate_kd": format_kd(daily_rate),
        "data_complete": monthly_income is not None and total_budget > 0,
        "warnings": warnings,
    }


def _get_safe_to_spend_payload_cached(
    user_id: int,
    month: str,
    *,
    today_date: date | None = None,
    tz: ZoneInfo | None = None,
) -> dict[str, object]:
    cache_key = _safe_to_spend_cache_key(user_id, month)
    cached_payload_raw = cache_get(cache_key)
    if cached_payload_raw:
        try:
            cached_payload = json.loads(cached_payload_raw)
            if isinstance(cached_payload, dict):
                return cached_payload
        except Exception:  # noqa: BLE001 - invalid cache entries should be discarded and recomputed.
            current_app.logger.warning(
                "Invalid cached safe-to-spend payload for key=%s; recomputing.",
                cache_key,
                exc_info=True,
            )

    payload = _build_safe_to_spend_payload(user_id, month, today_date=today_date, tz=tz)
    cache_set(cache_key, json.dumps(payload, separators=(",", ":"), ensure_ascii=True), ttl_seconds=300)
    return payload
