"""Pure debt payoff plan calculator (avalanche/snowball)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal

from backend.money_math import format_kd, quantize_kd, to_decimal

_MAX_MONTHS = 600


@dataclass
class _DebtState:
    debt_id: int | None
    name: str
    initial_balance: Decimal
    balance: Decimal
    apr_pct: Decimal
    minimum_payment: Decimal
    interest_paid: Decimal
    payoff_month: int | None


def _first_day_utc_today() -> date:
    today = datetime.now(timezone.utc).date()
    return date(today.year, today.month, 1)


def _add_months(base: date, months: int) -> date:
    if months <= 0:
        return base
    year = base.year + ((base.month - 1 + months) // 12)
    month = ((base.month - 1 + months) % 12) + 1
    return date(year, month, 1)


def _normalize_debts(debts: list[dict]) -> list[_DebtState]:
    out: list[_DebtState] = []
    for idx, row in enumerate(debts):
        balance = quantize_kd(max(to_decimal(row.get("balance_kd")), Decimal("0")))
        minimum = quantize_kd(max(to_decimal(row.get("minimum_payment_kd")), Decimal("0")))
        apr_pct = quantize_kd(max(to_decimal(row.get("apr_pct") or 0), Decimal("0")))
        if balance <= 0:
            continue
        debt_id = row.get("id")
        out.append(
            _DebtState(
                debt_id=int(debt_id) if debt_id is not None else idx + 1,
                name=(str(row.get("name") or "").strip() or f"Debt {idx + 1}"),
                initial_balance=balance,
                balance=balance,
                apr_pct=apr_pct,
                minimum_payment=minimum,
                interest_paid=Decimal("0"),
                payoff_month=None,
            )
        )
    return out


def _minimum_required(debts: list[_DebtState]) -> Decimal:
    return quantize_kd(sum((d.minimum_payment for d in debts), Decimal("0")))


def minimum_required_payment(debts: list[dict]) -> Decimal:
    return _minimum_required(_normalize_debts(debts))


def _validate_payment(debts: list[_DebtState], monthly_payment: Decimal) -> None:
    if monthly_payment <= 0 and debts:
        raise ValueError("monthly_payment must be greater than zero")
    minimum_required = _minimum_required(debts)
    if debts and monthly_payment < minimum_required:
        raise ValueError(
            f"Monthly payment must exceed minimum total of {format_kd(minimum_required)} KD"
        )


def _strategy_sort_key(strategy: str, debt: _DebtState) -> tuple:
    if strategy == "avalanche":
        # Highest APR first, then largest balance.
        return (-float(debt.apr_pct), -float(debt.balance), debt.name.lower(), int(debt.debt_id or 0))
    # Snowball: smallest balance first, then highest APR.
    return (float(debt.balance), -float(debt.apr_pct), debt.name.lower(), int(debt.debt_id or 0))


def _build_empty_plan(strategy: str, start_date: date) -> dict:
    return {
        "strategy": strategy,
        "total_months": 0,
        "total_interest_paid": "0.000",
        "debt_free_date": start_date.isoformat(),
        "payoff_order": [],
        "debt_free_impossible": False,
    }


def _build_impossible_plan(strategy: str, total_interest: Decimal) -> dict:
    return {
        "strategy": strategy,
        "total_months": _MAX_MONTHS,
        "total_interest_paid": format_kd(total_interest),
        "debt_free_date": "",
        "payoff_order": [],
        "debt_free_impossible": True,
    }


def _simulate_plan(
    debts_raw: list[dict],
    monthly_payment_raw: Decimal | str | float | int,
    *,
    strategy: str,
    start_date: date | None = None,
) -> dict:
    debts = _normalize_debts(debts_raw)
    start = start_date or _first_day_utc_today()
    if not debts:
        return _build_empty_plan(strategy, start)

    monthly_payment = quantize_kd(to_decimal(monthly_payment_raw))
    _validate_payment(debts, monthly_payment)

    month = 0
    while any(d.balance > 0 for d in debts):
        month += 1
        if month > _MAX_MONTHS:
            total_interest = sum((debt.interest_paid for debt in debts), Decimal("0"))
            return _build_impossible_plan(strategy, total_interest)

        active = [d for d in debts if d.balance > 0]
        starting_total = quantize_kd(sum((d.balance for d in active), Decimal("0")))
        # Interest accrues first each month on remaining balance.
        for debt in active:
            if debt.apr_pct <= 0:
                continue
            monthly_rate = debt.apr_pct / Decimal("1200")
            interest = quantize_kd(debt.balance * monthly_rate)
            if interest <= 0:
                continue
            debt.balance = quantize_kd(debt.balance + interest)
            debt.interest_paid = quantize_kd(debt.interest_paid + interest)

        remaining = monthly_payment
        # Apply minimums across all active debts.
        for debt in sorted(active, key=lambda d: int(d.debt_id or 0)):
            if remaining <= 0:
                break
            due = min(debt.minimum_payment, debt.balance)
            if due <= 0:
                continue
            pay = min(due, remaining)
            debt.balance = quantize_kd(max(Decimal("0"), debt.balance - pay))
            remaining = quantize_kd(max(Decimal("0"), remaining - pay))

        # Apply surplus to current strategy target.
        while remaining > 0:
            active_targets = [d for d in debts if d.balance > 0]
            if not active_targets:
                break
            target = sorted(
                active_targets,
                key=lambda d: _strategy_sort_key(strategy, d),
            )[0]
            pay = min(target.balance, remaining)
            target.balance = quantize_kd(max(Decimal("0"), target.balance - pay))
            remaining = quantize_kd(max(Decimal("0"), remaining - pay))
            if pay <= 0:
                break

        ending_total = quantize_kd(sum((d.balance for d in debts if d.balance > 0), Decimal("0")))
        if ending_total >= starting_total and ending_total > 0:
            total_interest = sum((debt.interest_paid for debt in debts), Decimal("0"))
            return _build_impossible_plan(strategy, total_interest)

        for debt in debts:
            if debt.payoff_month is None and debt.balance <= 0:
                debt.balance = Decimal("0")
                debt.payoff_month = month

    payoff_rows = []
    total_interest = Decimal("0")
    for debt in debts:
        payoff_month = int(debt.payoff_month or 0)
        payoff_date = _add_months(start, max(0, payoff_month - 1))
        total_interest += debt.interest_paid
        payoff_rows.append(
            {
                "debt_id": debt.debt_id,
                "name": debt.name,
                "balance": format_kd(debt.initial_balance),
                "rate": format_kd(debt.apr_pct),
                "months_to_payoff": payoff_month,
                "interest_paid": format_kd(debt.interest_paid),
                "payoff_date": payoff_date.isoformat(),
            }
        )

    payoff_rows.sort(
        key=lambda row: (
            int(row.get("months_to_payoff") or 0),
            str(row.get("name") or "").lower(),
        )
    )
    total_months = max((int(row["months_to_payoff"]) for row in payoff_rows), default=0)
    debt_free_date = _add_months(start, max(0, total_months - 1)).isoformat()
    return {
        "strategy": strategy,
        "total_months": total_months,
        "total_interest_paid": format_kd(total_interest),
        "debt_free_date": debt_free_date,
        "payoff_order": payoff_rows,
        "debt_free_impossible": False,
    }


def avalanche_plan(
    debts: list[dict],
    monthly_payment: Decimal | str | float | int,
    *,
    start_date: date | None = None,
) -> dict:
    return _simulate_plan(
        debts,
        monthly_payment,
        strategy="avalanche",
        start_date=start_date,
    )


def snowball_plan(
    debts: list[dict],
    monthly_payment: Decimal | str | float | int,
    *,
    start_date: date | None = None,
) -> dict:
    return _simulate_plan(
        debts,
        monthly_payment,
        strategy="snowball",
        start_date=start_date,
    )
