"""Account-overview, snapshot, and spending-intelligence payload builders."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from backend import db
from backend.constants import UNCAT_NAME
from backend.db_compat import month_bucket
from backend.lib.income import calendar_month_bounds
from backend.lib.payday import expense_category_filter_expr, income_category_filter_expr
from backend.models import (
    BankConnection,
    BankConsent,
    Category,
    DebtAccount,
    Merchant,
    RawBankTransaction,
    SavingsGoal,
    Transaction,
    UserProfile,
)
from backend.money_math import format_kd, to_decimal
from sqlalchemy import case
from sqlalchemy.sql import func

from .shared import (
    _build_month_window,
    _classify_recurring_frequency,
    _confidence_from_interval_variance,
    _interval_variance_ratio,
    _rounded_number,
    _rounded_percent,
    _source_filter_expr,
)


def _build_account_overview_payload(user_id: int, month: str) -> dict[str, object]:
    year, month_number = int(month[:4]), int(month[5:7])
    month_start, month_end = calendar_month_bounds(year, month_number)
    month_keys = _build_month_window(year, month_number, 6)

    ym_expr = month_bucket(Transaction.date)
    expense_filter = expense_category_filter_expr(Category.name, Category.is_income)
    income_filter = income_category_filter_expr(Category.name, Category.is_income)

    total_spend_mtd = to_decimal(
        db.session.query(func.coalesce(func.sum(Transaction.amount_kd), 0))
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.date >= month_start, Transaction.date <= month_end)
        .filter(expense_filter)
        .scalar()
    )
    total_income_mtd = to_decimal(
        db.session.query(func.coalesce(func.sum(Transaction.amount_kd), 0))
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.date >= month_start, Transaction.date <= month_end)
        .filter(income_filter)
        .scalar()
    )

    connections = (
        BankConnection.query
        .filter(BankConnection.user_id == user_id)
        .order_by(BankConnection.institution_name.asc(), BankConnection.id.asc())
        .all()
    )
    connection_ids = [int(connection.id) for connection in connections]

    connection_txn_counts: dict[int, int] = {}
    connection_spend_totals: dict[int, Decimal] = {}
    if connection_ids:
        count_rows = (
            db.session.query(
                RawBankTransaction.connection_id,
                func.count(func.distinct(RawBankTransaction.transaction_id)),
            )
            .join(Transaction, RawBankTransaction.transaction_id == Transaction.id)
            .filter(RawBankTransaction.user_id == user_id)
            .filter(Transaction.user_id == user_id)
            .filter(RawBankTransaction.connection_id.in_(connection_ids))
            .filter(Transaction.date >= month_start, Transaction.date <= month_end)
            .group_by(RawBankTransaction.connection_id)
            .all()
        )
        connection_txn_counts = {int(conn_id): int(count or 0) for conn_id, count in count_rows}

        spend_rows = (
            db.session.query(
                RawBankTransaction.connection_id,
                func.coalesce(func.sum(Transaction.amount_kd), 0),
            )
            .join(Transaction, RawBankTransaction.transaction_id == Transaction.id)
            .outerjoin(Category, Transaction.category_id == Category.id)
            .filter(RawBankTransaction.user_id == user_id)
            .filter(Transaction.user_id == user_id)
            .filter(RawBankTransaction.connection_id.in_(connection_ids))
            .filter(Transaction.date >= month_start, Transaction.date <= month_end)
            .filter(expense_filter)
            .group_by(RawBankTransaction.connection_id)
            .all()
        )
        connection_spend_totals = {int(conn_id): to_decimal(total or 0) for conn_id, total in spend_rows}

    connected_accounts = [
        {
            "connection_id": connection.id,
            "institution_name": connection.institution_name,
            "last_synced_at": connection.last_synced_at.isoformat() if connection.last_synced_at else None,
            "status": connection.status,
            "transactions_mtd": int(connection_txn_counts.get(int(connection.id), 0)),
            "spend_mtd": format_kd(connection_spend_totals.get(int(connection.id), Decimal("0"))),
        }
        for connection in connections
    ]

    manual_source_filter = _source_filter_expr("manual")
    manual_transactions_mtd = int(
        db.session.query(func.count(Transaction.id))
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.date >= month_start, Transaction.date <= month_end)
        .filter(manual_source_filter)
        .scalar()
        or 0
    )
    manual_spend_mtd = to_decimal(
        db.session.query(func.coalesce(func.sum(Transaction.amount_kd), 0))
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.date >= month_start, Transaction.date <= month_end)
        .filter(manual_source_filter)
        .filter(expense_filter)
        .scalar()
    )

    top_rows = (
        db.session.query(
            func.coalesce(Category.name, UNCAT_NAME).label("category"),
            func.coalesce(func.sum(Transaction.amount_kd), 0).label("total"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.date >= month_start, Transaction.date <= month_end)
        .filter(expense_filter)
        .group_by(func.coalesce(Category.name, UNCAT_NAME))
        .order_by(func.sum(Transaction.amount_kd).desc(), func.coalesce(Category.name, UNCAT_NAME).asc())
        .limit(5)
        .all()
    )

    top_categories = []
    total_spend_for_pct = total_spend_mtd if total_spend_mtd > 0 else Decimal("0")
    for category_name, total in top_rows:
        amount = to_decimal(total or 0)
        top_categories.append(
            {
                "category": str(category_name or UNCAT_NAME),
                "amount_kd": format_kd(amount),
                "pct": _rounded_percent(amount, total_spend_for_pct),
            }
        )

    trend_rows = (
        db.session.query(
            ym_expr.label("month"),
            func.coalesce(
                func.sum(case((income_filter, Transaction.amount_kd), else_=0)),
                0,
            ).label("income_total"),
            func.coalesce(
                func.sum(case((expense_filter, Transaction.amount_kd), else_=0)),
                0,
            ).label("spend_total"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(ym_expr.in_(month_keys))
        .group_by(ym_expr)
        .all()
    )
    trend_map = {
        str(month_key): {
            "income": to_decimal(income_total or 0),
            "spend": to_decimal(spend_total or 0),
        }
        for month_key, income_total, spend_total in trend_rows
    }
    month_trend = [
        {
            "month": month_key,
            "spend": format_kd(trend_map.get(month_key, {}).get("spend", Decimal("0"))),
            "income": format_kd(trend_map.get(month_key, {}).get("income", Decimal("0"))),
        }
        for month_key in month_keys
    ]

    return {
        "month": month,
        "total_spend_mtd": format_kd(total_spend_mtd),
        "total_income_mtd": format_kd(total_income_mtd),
        "connected_accounts": connected_accounts,
        "manual_entry_summary": {
            "transactions_mtd": manual_transactions_mtd,
            "spend_mtd": format_kd(manual_spend_mtd),
        },
        "top_categories": top_categories,
        "month_trend": month_trend,
    }


_CONSENT_EXPIRY_WARNING_DAYS = 14


def _build_snapshot_payload(user_id: int, *, today_date: date | None = None) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    today = today_date or now.date()
    income_flag = income_category_filter_expr(Category.name, Category.is_income)

    totals = (
        db.session.query(
            func.sum(case((income_flag, Transaction.amount_kd), else_=0)).label("income"),
            func.sum(case((~income_flag, Transaction.amount_kd), else_=0)).label("expense"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .one()
    )
    income_total = to_decimal(totals.income or 0)
    expense_total = to_decimal(totals.expense or 0)

    debt_total = to_decimal(
        db.session.query(func.coalesce(func.sum(DebtAccount.balance_kd), 0))
        .filter(DebtAccount.user_id == user_id, DebtAccount.is_active.is_(True))
        .scalar()
        or 0
    )
    savings_total = to_decimal(
        db.session.query(func.coalesce(func.sum(SavingsGoal.current_kd), 0))
        .filter(SavingsGoal.user_id == user_id, SavingsGoal.is_active.is_(True))
        .scalar()
        or 0
    )

    def _window(days: int) -> dict[str, float]:
        cutoff = today - timedelta(days=days)
        row = (
            db.session.query(
                func.sum(case((income_flag, Transaction.amount_kd), else_=0)).label("inc"),
                func.sum(case((~income_flag, Transaction.amount_kd), else_=0)).label("exp"),
            )
            .select_from(Transaction)
            .outerjoin(Category, Transaction.category_id == Category.id)
            .filter(Transaction.user_id == user_id, Transaction.date >= cutoff)
            .one()
        )
        income = to_decimal(row.inc or 0)
        expense = to_decimal(row.exp or 0)
        return {
            "income_kd": _rounded_number(income),
            "expense_kd": _rounded_number(expense),
            "net_kd": _rounded_number(income - expense),
        }

    connections = (
        BankConnection.query
        .filter_by(user_id=user_id)
        .order_by(BankConnection.created_at.desc())
        .all()
    )
    connection_ids = [connection.id for connection in connections]
    consents_by_connection: dict[int, BankConsent] = {}
    if connection_ids:
        for consent in (
            BankConsent.query.filter(BankConsent.connection_id.in_(connection_ids))
            .order_by(BankConsent.granted_at.desc())
            .all()
        ):
            if consent.connection_id not in consents_by_connection:
                consents_by_connection[consent.connection_id] = consent

    accounts = []
    for connection in connections:
        consent = consents_by_connection.get(connection.id)
        consent_data = None
        if consent:
            expires_in_days = None
            expiry_warning = False
            if consent.expires_at:
                delta = (consent.expires_at - now).days
                expires_in_days = max(delta, 0)
                expiry_warning = delta <= _CONSENT_EXPIRY_WARNING_DAYS
            consent_data = {
                "id": consent.id,
                "status": consent.status,
                "granted_at": consent.granted_at.isoformat() if consent.granted_at else None,
                "expires_at": consent.expires_at.isoformat() if consent.expires_at else None,
                "expires_in_days": expires_in_days,
                "expiry_warning": expiry_warning,
            }
        accounts.append(
            {
                "id": connection.id,
                "institution_name": connection.institution_name,
                "provider": connection.provider,
                "account_number_masked": connection.account_number_masked,
                "status": connection.status,
                "last_synced_at": connection.last_synced_at.isoformat() if connection.last_synced_at else None,
                "consent": consent_data,
            }
        )

    return {
        "net_position": {
            "income_total_kd": _rounded_number(income_total),
            "expense_total_kd": _rounded_number(expense_total),
            "net_kd": _rounded_number(income_total - expense_total),
            "total_debt_kd": _rounded_number(debt_total),
            "total_savings_kd": _rounded_number(savings_total),
        },
        "cash_flow": {
            "30d": _window(30),
            "60d": _window(60),
            "90d": _window(90),
        },
        "accounts": accounts,
        "generated_at": now.isoformat(),
    }


def _build_spending_intelligence_payload(
    user_id: int,
    *,
    ref_year: int,
    ref_month: int,
    today_date: date | None = None,
) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    effective_today = today_date or now.date()
    current_month = f"{ref_year}-{ref_month:02d}"
    previous_month_date = date(ref_year, ref_month, 1) - timedelta(days=1)
    previous_month = f"{previous_month_date.year}-{previous_month_date.month:02d}"

    ym_expr = month_bucket(Transaction.date)
    expense_filter = expense_category_filter_expr(Category.name, Category.is_income)

    cutoff_90 = effective_today - timedelta(days=90)
    merchant_rows = (
        db.session.query(
            func.coalesce(Merchant.name, "Unknown").label("merchant"),
            func.sum(Transaction.amount_kd).label("total"),
            func.count(Transaction.id).label("txn_count"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .outerjoin(Merchant, Transaction.merchant_id == Merchant.id)
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.date >= cutoff_90)
        .filter(expense_filter)
        .group_by(func.coalesce(Merchant.name, "Unknown"))
        .order_by(func.sum(Transaction.amount_kd).desc())
        .limit(5)
        .all()
    )
    top_merchants = [
        {
            "merchant": merchant,
            "total_kd": _rounded_number(total),
            "transaction_count": int(txn_count or 0),
        }
        for merchant, total, txn_count in merchant_rows
    ]

    category_rows = (
        db.session.query(
            ym_expr.label("ym"),
            func.coalesce(Category.name, UNCAT_NAME).label("cat"),
            func.sum(Transaction.amount_kd).label("total"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(ym_expr.in_([current_month, previous_month]))
        .filter(expense_filter)
        .group_by(ym_expr, func.coalesce(Category.name, UNCAT_NAME))
        .all()
    )

    current_by_category: dict[str, Decimal] = {}
    previous_by_category: dict[str, Decimal] = {}
    for ym_value, category, total in category_rows:
        month_key = str(ym_value or "")
        amount = to_decimal(total or 0)
        if month_key == current_month:
            current_by_category[category] = amount
        elif month_key == previous_month:
            previous_by_category[category] = amount

    category_deltas = []
    for category in set(current_by_category) | set(previous_by_category):
        current_total = current_by_category.get(category, Decimal("0"))
        previous_total = previous_by_category.get(category, Decimal("0"))
        delta_amount = current_total - previous_total
        delta_pct = _rounded_percent(delta_amount, previous_total) if previous_total > 0 else (100.0 if current_total > 0 else 0.0)
        category_deltas.append(
            {
                "category": category,
                "current_kd": _rounded_number(current_total),
                "previous_kd": _rounded_number(previous_total),
                "delta_kd": _rounded_number(delta_amount),
                "delta_pct": delta_pct,
            }
        )
    category_deltas.sort(key=lambda row: abs(row["delta_kd"]), reverse=True)

    benchmark_months: list[str] = []
    cursor = date(ref_year, ref_month, 1)
    for _ in range(4):
        benchmark_months.append(f"{cursor.year}-{cursor.month:02d}")
        cursor = date(cursor.year, cursor.month, 1) - timedelta(days=1)
        cursor = date(cursor.year, cursor.month, 1)

    history_months = benchmark_months[1:]
    benchmark_rows = (
        db.session.query(
            ym_expr.label("ym"),
            func.coalesce(Category.name, UNCAT_NAME).label("cat"),
            func.sum(Transaction.amount_kd).label("total"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(ym_expr.in_(benchmark_months))
        .filter(expense_filter)
        .group_by(ym_expr, func.coalesce(Category.name, UNCAT_NAME))
        .all()
    )

    benchmark_maps: dict[str, dict[str, Decimal]] = {month_key: {} for month_key in benchmark_months}
    benchmark_categories: set[str] = set()
    for ym_value, category, total in benchmark_rows:
        month_key = str(ym_value or "")
        if month_key not in benchmark_maps:
            continue
        amount = to_decimal(total or 0)
        benchmark_maps[month_key][category] = amount
        benchmark_categories.add(category)

    category_benchmarks = []
    for category in benchmark_categories:
        current_total = benchmark_maps.get(current_month, {}).get(category, Decimal("0"))
        average_total = (
            sum(
                (benchmark_maps.get(month_key, {}).get(category, Decimal("0")) for month_key in history_months),
                Decimal("0"),
            ) / Decimal(max(1, len(history_months)))
        )
        delta_amount = current_total - average_total
        delta_pct = _rounded_percent(delta_amount, average_total) if average_total > 0 else (100.0 if current_total > 0 else 0.0)
        category_benchmarks.append(
            {
                "category": category,
                "current_kd": _rounded_number(current_total),
                "average_kd": _rounded_number(average_total),
                "delta_kd": _rounded_number(delta_amount),
                "delta_pct": delta_pct,
            }
        )

    category_benchmarks.sort(
        key=lambda row: (
            max(row["current_kd"], row["average_kd"]),
            abs(row["delta_kd"]),
            str(row["category"]),
        ),
        reverse=True,
    )

    recurring_rows = (
        db.session.query(
            Transaction.date.label("tx_date"),
            func.coalesce(func.nullif(func.trim(Transaction.name), ""), "Unnamed").label("display_name"),
            Transaction.amount_kd.label("amount_kd"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.date >= cutoff_90)
        .filter(expense_filter)
        .order_by(Transaction.date.asc(), Transaction.id.asc())
        .all()
    )

    grouped: dict[str, list[tuple[date, str, Decimal]]] = {}
    for tx_date, display_name, amount_kd in recurring_rows:
        if tx_date is None:
            continue
        normalized = " ".join((display_name or "").split()) or "Unnamed"
        amount = to_decimal(amount_kd)
        if amount <= 0:
            continue
        grouped.setdefault(normalized.lower(), []).append((tx_date, normalized, amount))

    recurring_bills = []
    for entries in grouped.values():
        if len(entries) < 2:
            continue
        sorted_dates = sorted(tx_date for tx_date, _, _ in entries)
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
        confidence = _confidence_from_interval_variance(_interval_variance_ratio(intervals))
        if frequency == "irregular" and confidence == "high":
            confidence = "medium"
        if confidence == "low":
            continue
        amounts = [amount for _, _, amount in entries]
        average_amount = sum(amounts, Decimal("0")) / Decimal(len(amounts))
        name_counts = Counter(name for _, name, _ in entries)
        canonical_name = sorted(name_counts.items(), key=lambda pair: (-pair[1], pair[0]))[0][0]
        recurring_bills.append(
            {
                "name": canonical_name,
                "frequency": frequency,
                "avg_amount_kd": format_kd(average_amount),
                "confidence": confidence,
                "occurrences": len(entries),
                "_sort": average_amount,
            }
        )

    recurring_bills.sort(key=lambda row: -to_decimal(row.pop("_sort", Decimal("0"))))
    return {
        "month": current_month,
        "prev_month": previous_month,
        "top_merchants": top_merchants,
        "category_benchmarks": category_benchmarks[:8],
        "category_deltas": category_deltas[:8],
        "recurring_bills": recurring_bills[:5],
        "generated_at": now.isoformat(),
    }
