"""Income and recurring-pattern analytics payload builders."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.sql import func

from backend import db
from backend.lib.payday import expense_category_filter_expr, income_category_filter_expr
from backend.models import Category, Merchant, Transaction
from backend.money_math import format_kd, to_decimal

from .shared import (
    _classify_recurring_frequency,
    _classify_recurring_group,
    _confidence_from_interval_variance,
    _confidence_from_variance,
    _current_local_date,
    _current_month_key,
    _interval_variance_ratio,
    _month_key,
)


def _build_income_pattern_payload(
    *,
    user_id: int,
    current_month: str | None = None,
    today_date: date | None = None,
    tz: ZoneInfo | None = None,
) -> dict[str, object]:
    effective_today = today_date or (_current_local_date(tz) if tz is not None else datetime.now(timezone.utc).date())
    current_month_key = current_month or (_current_month_key(tz) if tz is not None else _month_key(effective_today))
    from backend.lib.income import resolve_income_for_period

    income_resolution = resolve_income_for_period(user_id, current_month_key)
    resolved_monthly_income_kd = (
        format_kd(income_resolution.amount_kd) if income_resolution.amount_kd is not None else None
    )
    income_source = income_resolution.source
    income_auto_detected = income_source == "detected_from_transactions"

    cutoff = effective_today - timedelta(days=90)
    rows = (
        db.session.query(
            Transaction.date.label("tx_date"),
            func.coalesce(func.nullif(func.trim(Transaction.name), ""), "Income").label("income_name"),
            Transaction.amount_kd.label("amount_kd"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.date >= cutoff)
        .filter(income_category_filter_expr(Category.name, Category.is_income))
        .order_by(Transaction.date.asc(), Transaction.id.asc())
        .all()
    )

    parsed_rows: list[tuple[date, str, str, Decimal]] = []
    for tx_date, income_name, amount_kd in rows:
        if tx_date is None:
            continue
        amount = to_decimal(amount_kd)
        if amount <= 0:
            continue
        display_name = " ".join((income_name or "").split()) or "Income"
        parsed_rows.append((tx_date, display_name, display_name.lower(), amount))

    overall_months = len({_month_key(tx_date) for tx_date, _, _, _ in parsed_rows})
    if overall_months < 2:
        return {
            "detected": False,
            "monthly_income_kd": resolved_monthly_income_kd,
            "income_source": income_source,
            "income_auto_detected": income_auto_detected,
            "suggested_monthly_income_kd": None,
            "suggested_payday_day": None,
            "confidence": "low",
            "evidence_months": overall_months,
            "largest_income_name": None,
        }

    grouped: dict[str, list[tuple[date, str, Decimal]]] = {}
    for tx_date, display_name, name_key, amount in parsed_rows:
        grouped.setdefault(name_key, []).append((tx_date, display_name, amount))

    candidates: list[dict[str, object]] = []
    for name_key, entries in grouped.items():
        if len(entries) < 2:
            continue

        dates = sorted(tx_date for tx_date, _display_name, _amount in entries)
        evidence_months = len({_month_key(tx_date) for tx_date in dates})
        if evidence_months < 2:
            continue

        amounts = [amount for _tx_date, _display_name, amount in entries]
        average_amount = sum(amounts, Decimal("0")) / Decimal(len(amounts))
        if average_amount <= 0:
            continue
        max_deviation = max((abs(amount - average_amount) / average_amount for amount in amounts), default=Decimal("0"))

        day_counts = Counter(tx_date.day for tx_date in dates)
        suggested_payday_day = sorted(day_counts.items(), key=lambda pair: (-pair[1], pair[0]))[0][0]
        name_counts = Counter(display_name for _tx_date, display_name, _amount in entries)
        largest_income_name = sorted(name_counts.items(), key=lambda pair: (-pair[1], pair[0]))[0][0]

        day_gaps = sorted((dates[index] - dates[index - 1]).days for index in range(1, len(dates)))
        median_gap = day_gaps[len(day_gaps) // 2] if day_gaps else None
        multiplier = Decimal("2") if median_gap is not None and median_gap <= 18 else Decimal("1")

        candidates.append(
            {
                "name_key": name_key,
                "largest_income_name": largest_income_name,
                "suggested_monthly_income": average_amount * multiplier,
                "suggested_payday_day": suggested_payday_day,
                "confidence": _confidence_from_variance(max_deviation, evidence_months),
                "evidence_months": evidence_months,
                "score": (evidence_months, len(entries), sum(amounts, Decimal("0")), -max_deviation),
            }
        )

    if not candidates:
        return {
            "detected": False,
            "monthly_income_kd": resolved_monthly_income_kd,
            "income_source": income_source,
            "income_auto_detected": income_auto_detected,
            "suggested_monthly_income_kd": None,
            "suggested_payday_day": None,
            "confidence": "low",
            "evidence_months": overall_months,
            "largest_income_name": None,
        }

    best = max(candidates, key=lambda candidate: candidate["score"])
    return {
        "detected": True,
        "monthly_income_kd": resolved_monthly_income_kd,
        "income_source": income_source,
        "income_auto_detected": income_auto_detected,
        "suggested_monthly_income_kd": format_kd(best["suggested_monthly_income"]),
        "suggested_payday_day": int(best["suggested_payday_day"]),
        "confidence": str(best["confidence"]),
        "evidence_months": int(best["evidence_months"]),
        "largest_income_name": str(best["largest_income_name"]),
    }


def _build_recurring_patterns_payload(
    *,
    user_id: int,
    days: int,
    today_date: date | None = None,
    tz: ZoneInfo | None = None,
) -> dict[str, object]:
    effective_today = today_date or (_current_local_date(tz) if tz is not None else datetime.now(timezone.utc).date())
    cutoff = effective_today - timedelta(days=days)
    rows = (
        db.session.query(
            Transaction.date.label("tx_date"),
            func.coalesce(func.nullif(func.trim(Transaction.name), ""), "Unnamed").label("display_name"),
            Transaction.amount_kd.label("amount_kd"),
            Category.name.label("category_name"),
            Merchant.name.label("merchant_name"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .outerjoin(Merchant, Transaction.merchant_id == Merchant.id)
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.date >= cutoff)
        .filter(expense_category_filter_expr(Category.name, Category.is_income))
        .order_by(Transaction.date.asc(), Transaction.id.asc())
        .all()
    )

    grouped: dict[str, list[tuple[date, str, Decimal, str | None, str | None]]] = {}
    for tx_date, display_name, amount_kd, category_name, merchant_name in rows:
        if tx_date is None:
            continue
        normalized_name = " ".join((display_name or "").split()) or "Unnamed"
        amount = to_decimal(amount_kd)
        if amount <= 0:
            continue
        grouped.setdefault(normalized_name.lower(), []).append(
            (
                tx_date,
                normalized_name,
                amount,
                str(category_name).strip() if category_name else None,
                str(merchant_name).strip() if merchant_name else None,
            )
        )

    patterns: list[dict[str, object]] = []
    for entries in grouped.values():
        if len(entries) < 2:
            continue

        sorted_dates = sorted(tx_date for tx_date, _name, _amount, _category, _merchant in entries)
        intervals = [
            (sorted_dates[index] - sorted_dates[index - 1]).days
            for index in range(1, len(sorted_dates))
            if (sorted_dates[index] - sorted_dates[index - 1]).days > 0
        ]
        if not intervals:
            continue

        ordered = sorted(intervals)
        median_interval = ordered[len(ordered) // 2]
        frequency = _classify_recurring_frequency(median_interval)
        variance = _interval_variance_ratio(intervals)
        confidence = _confidence_from_interval_variance(variance)
        if frequency == "irregular" and confidence == "high":
            confidence = "medium"

        amounts = [amount for _tx_date, _name, amount, _category, _merchant in entries]
        average_amount = sum(amounts, Decimal("0")) / Decimal(len(amounts))
        name_counts = Counter(name for _tx_date, name, _amount, _category, _merchant in entries)
        category_counts = Counter(
            category_name
            for _tx_date, _name, _amount, category_name, _merchant in entries
            if category_name
        )
        merchant_counts = Counter(
            merchant_name
            for _tx_date, _name, _amount, _category_name, merchant_name in entries
            if merchant_name
        )

        canonical_name = sorted(name_counts.items(), key=lambda pair: (-pair[1], pair[0]))[0][0]
        dominant_category = (
            sorted(category_counts.items(), key=lambda pair: (-pair[1], pair[0]))[0][0]
            if category_counts
            else None
        )
        dominant_merchant = (
            sorted(merchant_counts.items(), key=lambda pair: (-pair[1], pair[0]))[0][0]
            if merchant_counts
            else None
        )
        last_seen = max(sorted_dates)

        patterns.append(
            {
                "name": canonical_name,
                "frequency": frequency,
                "avg_amount_kd": format_kd(average_amount),
                "last_seen": last_seen.isoformat(),
                "confidence": confidence,
                "occurrences": len(entries),
                "group": _classify_recurring_group(
                    category_name=dominant_category,
                    merchant_name=dominant_merchant,
                    display_name=canonical_name,
                ),
                "_sort_avg_amount": average_amount,
            }
        )

    patterns.sort(
        key=lambda row: (
            -to_decimal(row.get("_sort_avg_amount")),
            -int(row.get("occurrences", 0)),
            str(row.get("name", "")),
        )
    )
    for row in patterns:
        row.pop("_sort_avg_amount", None)
    return {"patterns": patterns}
