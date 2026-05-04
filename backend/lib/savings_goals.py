"""Shared savings-goal projection helpers."""

from __future__ import annotations

import json
from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation, ROUND_CEILING

from backend.models import ProductEvent, SavingsGoal
from backend.money_math import format_kd


def _quantize_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"))


def _month_start(day: date) -> date:
    return day.replace(day=1)


def _add_months(month_anchor: date, months: int) -> date:
    total = ((month_anchor.year * 12) + (month_anchor.month - 1)) + int(months)
    year = total // 12
    month = (total % 12) + 1
    return date(year, month, 1)


def monthly_pace_from_deposits(goal: SavingsGoal, *, today: date, lookback_months: int = 3) -> Decimal:
    """Average monthly deposits over the trailing lookback window (including this month)."""
    months = max(1, int(lookback_months))
    this_month = _month_start(today)
    window_start = _add_months(this_month, -(months - 1))
    window_start_dt = datetime.combine(window_start, time.min, tzinfo=timezone.utc)

    rows = (
        ProductEvent.query
        .with_entities(ProductEvent.event_ts, ProductEvent.properties_json)
        .filter(ProductEvent.user_id == goal.user_id)
        .filter(ProductEvent.event_name == "savings_goal.deposit")
        .filter(ProductEvent.event_ts >= window_start_dt)
        .all()
    )

    totals_by_month: dict[str, Decimal] = {}
    for row_ts, properties_json in rows:
        if not row_ts:
            continue
        try:
            payload = json.loads(properties_json or "{}")
        except Exception:  # noqa: BLE001 - optional goal metadata should not break reserve calculations.
            payload = {}
        if not isinstance(payload, dict):
            continue
        try:
            event_goal_id = int(payload.get("goal_id"))
        except Exception:  # noqa: BLE001 - optional goal metadata should not break reserve calculations.
            continue
        if event_goal_id != int(goal.id):
            continue
        try:
            amount = Decimal(str(payload.get("amount_kd") or "0"))
        except (InvalidOperation, ValueError, TypeError):
            amount = Decimal("0")
        if amount <= 0:
            continue
        month_key = f"{row_ts.year:04d}-{row_ts.month:02d}"
        totals_by_month[month_key] = totals_by_month.get(month_key, Decimal("0")) + amount

    month_total = Decimal("0")
    for offset in range(months):
        month_cursor = _add_months(this_month, -offset)
        key = f"{month_cursor.year:04d}-{month_cursor.month:02d}"
        month_total += totals_by_month.get(key, Decimal("0"))

    avg = month_total / Decimal(months)
    if avg < 0:
        avg = Decimal("0")
    return _quantize_money(avg)


def _months_to_target_date(today: date, target_date: date | None) -> int | None:
    if target_date is None:
        return None
    if target_date <= today:
        return 0
    days = (target_date - today).days
    return max(1, (days + 29) // 30)


def _goal_projection_snapshot(goal: SavingsGoal, *, today: date | None = None) -> dict[str, object]:
    today_date = today or datetime.now(timezone.utc).date()
    target = Decimal(str(goal.target_kd or "0"))
    current = Decimal(str(goal.current_kd or "0"))
    if target < 0:
        target = Decimal("0")
    if current < 0:
        current = Decimal("0")

    remaining = target - current
    if remaining < 0:
        remaining = Decimal("0")

    current_pace = monthly_pace_from_deposits(goal, today=today_date, lookback_months=3)
    months_to_target = _months_to_target_date(today_date, goal.target_date)

    if remaining <= 0:
        projected_date = today_date
        months_remaining = 0
    elif current_pace > 0:
        months_remaining = int(
            (remaining / current_pace).to_integral_value(rounding=ROUND_CEILING)
        )
        months_remaining = max(1, months_remaining)
        projected_date = _add_months(_month_start(today_date), months_remaining)
    else:
        projected_date = None
        months_remaining = None

    required_monthly: Decimal | None = None
    if remaining <= 0:
        required_monthly = Decimal("0")
    elif months_to_target is not None and months_to_target > 0:
        required_monthly = _quantize_money(remaining / Decimal(months_to_target))
    elif months_to_target == 0:
        required_monthly = _quantize_money(remaining)

    if required_monthly is None:
        on_track = bool(current_pace > 0 or remaining <= 0)
        shortfall = None
    else:
        on_track = current_pace >= required_monthly
        shortfall = Decimal("0") if on_track else _quantize_money(required_monthly - current_pace)

    return {
        "remaining": remaining,
        "current_pace": current_pace,
        "required_monthly": required_monthly,
        "projected_date": projected_date,
        "months_remaining": months_remaining,
        "on_track": bool(on_track),
        "shortfall": shortfall,
    }


def goal_projection(goal: SavingsGoal, *, today: date | None = None) -> dict[str, object]:
    snapshot = _goal_projection_snapshot(goal, today=today)

    required_monthly = snapshot["required_monthly"]
    current_pace = snapshot["current_pace"]
    shortfall = snapshot["shortfall"]
    projected_date = snapshot["projected_date"]

    return {
        "projected_date": projected_date.isoformat() if projected_date else None,
        "months_remaining": snapshot["months_remaining"],
        "required_monthly": format_kd(required_monthly) if required_monthly is not None else None,
        "current_pace_monthly": format_kd(current_pace),
        "on_track": bool(snapshot["on_track"]),
        "shortfall_per_month": format_kd(shortfall) if shortfall is not None else None,
    }


def goal_monthly_commitment(goal: SavingsGoal, *, today: date | None = None) -> dict[str, object]:
    snapshot = _goal_projection_snapshot(goal, today=today)
    remaining = snapshot["remaining"]
    required_monthly = snapshot["required_monthly"]
    current_pace = snapshot["current_pace"]

    if remaining <= 0:
        monthly_commitment = Decimal("0")
        source = "completed"
    elif required_monthly is not None and required_monthly > 0:
        monthly_commitment = required_monthly
        source = "required_monthly"
    elif current_pace > 0:
        monthly_commitment = current_pace
        source = "current_pace"
    else:
        monthly_commitment = Decimal("0")
        source = "unscheduled"

    return {
        "monthly_commitment_kd": _quantize_money(monthly_commitment),
        "source": source,
        "remaining_kd": _quantize_money(remaining),
    }
