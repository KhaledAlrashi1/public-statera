"""User-scoped demo workspace seeding and cleanup."""

from __future__ import annotations

import json
from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from backend import db
from backend.lib.categories import get_or_create_category
from backend.lib.transactions import create_transaction_with_dup_check
from backend.models import (
    BankConnection,
    Budget,
    DebtAccount,
    ProductEvent,
    SavingsGoal,
    Transaction,
    UserProfile,
)
from backend.product_events import record_event, record_event_once


DEMO_TRANSACTION_SOURCE = "demo"
DEMO_DATA_EVENT = "demo_data_loaded"
DEMO_MANIFEST_EVENT = "demo_workspace_manifest"
DEMO_CLEARED_EVENT = "demo_data_cleared"
DEMO_REPLACED_WITH_IMPORT_EVENT = "demo_data_replaced_with_import"

_DEMO_PROFILE_DEFAULTS = {
    "monthly_income_kd": Decimal("1800.000"),
    "payday_day": 25,
    "country": "Kuwait",
}


class DemoDataConflictError(RuntimeError):
    """Raised when demo data would overwrite existing user data."""


class DemoDataNotLoadedError(RuntimeError):
    """Raised when no active demo workspace exists to clear."""


@dataclass(frozen=True)
class DemoTransactionTemplate:
    month_offset: int
    day: int
    category: str
    name: str
    amount_kd: str
    merchant: str | None = None


@dataclass(frozen=True)
class DemoWorkspaceManifest:
    month: str
    months_seeded: int
    transaction_ids: tuple[int, ...]
    budget_ids: tuple[int, ...]
    debt_account_ids: tuple[int, ...]
    savings_goal_ids: tuple[int, ...]
    profile_seeded_fields: tuple[str, ...]

    def to_properties(self) -> dict[str, Any]:
        return {
            "month": self.month,
            "months_seeded": self.months_seeded,
            "transaction_ids": list(self.transaction_ids),
            "budget_ids": list(self.budget_ids),
            "debt_account_ids": list(self.debt_account_ids),
            "savings_goal_ids": list(self.savings_goal_ids),
            "profile_seeded_fields": list(self.profile_seeded_fields),
        }


_DEMO_BUDGETS = [
    ("Housing", Decimal("450.000")),
    ("Groceries", Decimal("150.000")),
    ("Dining", Decimal("95.000")),
    ("Transport", Decimal("70.000")),
    ("Utilities", Decimal("40.000")),
    ("Entertainment", Decimal("55.000")),
    ("Health", Decimal("30.000")),
]

def _demo_tx(
    month_offset: int,
    day: int,
    category: str,
    name: str,
    amount_kd: str,
    merchant: str | None = None,
) -> DemoTransactionTemplate:
    return DemoTransactionTemplate(month_offset, day, category, name, amount_kd, merchant)


def _build_demo_transactions() -> tuple[DemoTransactionTemplate, ...]:
    month_specs = (
        {
            "offset": -5,
            "salary": "1800.000",
            "groceries_a": "44.600",
            "groceries_b": "18.400",
            "mobile": "6.900",
            "dining": "9.800",
            "coffee": "2.900",
            "transport_a": "8.400",
            "transport_b": "3.200",
            "subscription": "6.500",
            "utilities_extra": "11.800",
            "extra": ("Health", "Pharmacy run", "12.700", "Boots"),
        },
        {
            "offset": -4,
            "salary": "1800.000",
            "groceries_a": "47.200",
            "groceries_b": "21.300",
            "mobile": "7.100",
            "dining": "6.200",
            "coffee": "3.100",
            "transport_a": "9.100",
            "transport_b": "4.000",
            "subscription": "4.500",
            "utilities_extra": "10.900",
            "extra": ("Shopping", "Weekend basics", "17.500", "Centrepoint"),
            "bonus": ("Income: Freelance", "Weekend consulting", "120.000", "Side Project"),
        },
        {
            "offset": -3,
            "salary": "1800.000",
            "groceries_a": "41.900",
            "groceries_b": "19.100",
            "mobile": "6.800",
            "dining": "13.600",
            "coffee": "2.600",
            "transport_a": "8.200",
            "transport_b": "3.600",
            "subscription": "4.500",
            "utilities_extra": "12.100",
            "extra": ("Household", "Home essentials", "14.400", "IKEA"),
        },
        {
            "offset": -2,
            "salary": "1800.000",
            "groceries_a": "49.300",
            "groceries_b": "22.600",
            "mobile": "7.000",
            "dining": "18.900",
            "coffee": "3.400",
            "transport_a": "7.900",
            "transport_b": "4.200",
            "subscription": "4.500",
            "utilities_extra": "11.400",
            "extra": ("Health", "Dentist visit", "28.000", "Dental Studio"),
            "bonus": ("Income: Cashback", "Card cashback", "8.500", "NBK"),
        },
        {
            "offset": -1,
            "salary": "1800.000",
            "groceries_a": "52.800",
            "groceries_b": "20.800",
            "mobile": "7.200",
            "dining": "16.200",
            "coffee": "2.800",
            "transport_a": "8.900",
            "transport_b": "3.800",
            "subscription": "4.500",
            "utilities_extra": "10.700",
            "extra": ("Gifts", "Birthday gift", "13.200", "Miniso"),
        },
        {
            "offset": 0,
            "salary": "1800.000",
            "groceries_a": "46.700",
            "groceries_b": "24.400",
            "mobile": "7.000",
            "dining": "14.200",
            "coffee": "3.200",
            "transport_a": "8.600",
            "transport_b": "4.100",
            "subscription": "4.500",
            "utilities_extra": "12.300",
            "extra": ("Housing", "Unexpected plumbing fix", "92.000", "HomeFix"),
            "bonus": ("Income: Freelance", "Freelance project", "160.000", "Upwork"),
        },
    )

    templates: list[DemoTransactionTemplate] = []
    for spec in month_specs:
        offset = int(spec["offset"])
        templates.extend(
            [
                _demo_tx(offset, 25, "Income: Salary", "Monthly salary", str(spec["salary"]), "Acme Co."),
                _demo_tx(offset, 1, "Housing", "Apartment rent", "450.000", "Pearl Residences"),
                _demo_tx(offset, 4, "Groceries", "Weekly groceries", str(spec["groceries_a"]), "Lulu Hypermarket"),
                _demo_tx(offset, 18, "Groceries", "Top-up groceries", str(spec["groceries_b"]), "Carrefour"),
                _demo_tx(offset, 7, "Utilities", "Home internet", "15.000", "Ooredoo"),
                _demo_tx(offset, 9, "Utilities", "Mobile plan", str(spec["mobile"]), "STC"),
                _demo_tx(offset, 11, "Dining", "Coffee run", str(spec["coffee"]), "% Arabica"),
                _demo_tx(offset, 13, "Dining", "Lunch out", str(spec["dining"]), "Pick"),
                _demo_tx(offset, 15, "Transport", "Ride share", str(spec["transport_a"]), "Careem"),
                _demo_tx(offset, 22, "Transport", "Fuel top-up", str(spec["transport_b"]), "Q8 Fuel"),
                _demo_tx(offset, 21, "Entertainment", "Streaming subscription", str(spec["subscription"]), "Netflix"),
                _demo_tx(offset, 23, "Utilities", "Electricity and water", str(spec["utilities_extra"]), "MEW"),
            ]
        )

        extra_category, extra_name, extra_amount, extra_merchant = spec["extra"]
        templates.append(_demo_tx(offset, 26, extra_category, extra_name, extra_amount, extra_merchant))

        bonus = spec.get("bonus")
        if isinstance(bonus, tuple):
            bonus_category, bonus_name, bonus_amount, bonus_merchant = bonus
            templates.append(_demo_tx(offset, 28, bonus_category, bonus_name, bonus_amount, bonus_merchant))

    return tuple(templates)


_DEMO_TRANSACTIONS = _build_demo_transactions()


def _month_start_for(offset: int) -> date:
    now = datetime.now(timezone.utc).date()
    year = now.year
    month = now.month + offset
    while month < 1:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    return date(year, month, 1)


def _date_for(month_offset: int, day: int) -> date:
    month_start = _month_start_for(month_offset)
    return date(
        month_start.year,
        month_start.month,
        min(max(1, int(day)), monthrange(month_start.year, month_start.month)[1]),
    )


def _json_properties(row: ProductEvent | None) -> dict[str, Any]:
    if row is None or not row.properties_json:
        return {}
    try:
        payload = json.loads(row.properties_json)
    except Exception:  # noqa: BLE001 - demo-data cleanup should remain best-effort around non-critical failures.
        return {}
    return payload if isinstance(payload, dict) else {}


def _latest_event(user_id: int, event_name: str) -> ProductEvent | None:
    return (
        ProductEvent.query
        .filter(ProductEvent.user_id == int(user_id), ProductEvent.event_name == event_name)
        .order_by(ProductEvent.id.desc())
        .first()
    )


def _latest_manifest(user_id: int) -> DemoWorkspaceManifest | None:
    payload = _json_properties(_latest_event(user_id, DEMO_MANIFEST_EVENT))
    if not payload:
        return None

    def _ids(key: str) -> tuple[int, ...]:
        raw = payload.get(key)
        if not isinstance(raw, list):
            return ()
        values: list[int] = []
        for item in raw:
            try:
                values.append(int(item))
            except (TypeError, ValueError):
                continue
        return tuple(values)

    seeded_fields_raw = payload.get("profile_seeded_fields")
    seeded_fields = tuple(
        field
        for field in (seeded_fields_raw if isinstance(seeded_fields_raw, list) else [])
        if field in _DEMO_PROFILE_DEFAULTS
    )

    return DemoWorkspaceManifest(
        month=str(payload.get("month") or _month_start_for(0).strftime("%Y-%m")),
        months_seeded=max(1, int(payload.get("months_seeded") or 6)),
        transaction_ids=_ids("transaction_ids"),
        budget_ids=_ids("budget_ids"),
        debt_account_ids=_ids("debt_account_ids"),
        savings_goal_ids=_ids("savings_goal_ids"),
        profile_seeded_fields=seeded_fields,
    )


def _has_financial_data(user_id: int) -> bool:
    profile = UserProfile.query.filter_by(user_id=user_id).first()
    if profile and (profile.monthly_income_kd is not None or profile.payday_day is not None):
        return True
    for model in (Transaction, Budget, DebtAccount, SavingsGoal, BankConnection):
        row = model.query.with_entities(model.id).filter(model.user_id == int(user_id)).first()
        if row:
            return True
    return False


def _ensure_profile(user_id: int) -> list[str]:
    profile = UserProfile.query.filter_by(user_id=user_id).first()
    if profile is None:
        profile = UserProfile(user_id=user_id)
        db.session.add(profile)

    seeded_fields: list[str] = []
    if profile.monthly_income_kd is None:
        profile.monthly_income_kd = _DEMO_PROFILE_DEFAULTS["monthly_income_kd"]
        seeded_fields.append("monthly_income_kd")
    if profile.payday_day is None:
        profile.payday_day = int(_DEMO_PROFILE_DEFAULTS["payday_day"])
        seeded_fields.append("payday_day")
    if not profile.country:
        profile.country = str(_DEMO_PROFILE_DEFAULTS["country"])
        seeded_fields.append("country")
    return seeded_fields


def _ensure_budget(month: str, category_name: str, amount_kd: Decimal, user_id: int) -> tuple[Budget, bool]:
    category = get_or_create_category(category_name, user_id)
    budget = Budget.query.filter_by(user_id=user_id, month=month, category_id=category.id).first()
    if budget is None:
        budget = Budget(user_id=user_id, month=month, category_id=category.id, amount_kd=amount_kd)
        db.session.add(budget)
        return budget, True
    budget.amount_kd = amount_kd
    return budget, False


def _ensure_debt_account(user_id: int) -> tuple[DebtAccount, bool]:
    existing = DebtAccount.query.filter_by(user_id=user_id, name="Starter Card").first()
    if existing is not None:
        return existing, False
    account = DebtAccount(
        user_id=user_id,
        name="Starter Card",
        debt_type="credit_card",
        balance_kd=Decimal("420.000"),
        minimum_payment_kd=Decimal("28.000"),
        due_day=12,
        apr_pct=Decimal("18.900"),
        notes="Demo debt account for payoff planning.",
    )
    db.session.add(account)
    return account, True


def _ensure_savings_goal(user_id: int) -> tuple[SavingsGoal, bool]:
    existing = SavingsGoal.query.filter_by(user_id=user_id, name="Emergency Buffer").first()
    if existing is not None:
        return existing, False
    goal = SavingsGoal(
        user_id=user_id,
        name="Emergency Buffer",
        goal_type="starter_buffer",
        target_kd=Decimal("1000.000"),
        current_kd=Decimal("320.000"),
        notes="Demo savings goal to illustrate progress tracking.",
    )
    db.session.add(goal)
    return goal, True


def _create_demo_transaction(template: DemoTransactionTemplate, user_id: int) -> Transaction | None:
    txn_date = _date_for(template.month_offset, template.day)
    amount = Decimal(template.amount_kd)
    txn, is_dup, error = create_transaction_with_dup_check(
        txn_date,
        template.category,
        template.name,
        amount,
        user_id,
        False,
        template.merchant,
        source=DEMO_TRANSACTION_SOURCE,
    )
    if error or txn is None or is_dup:
        return None

    return txn


def _record_demo_manifest(user_id: int, manifest: DemoWorkspaceManifest) -> None:
    record_event(
        DEMO_MANIFEST_EVENT,
        user_id,
        properties=manifest.to_properties(),
        commit=False,
    )


def load_demo_workspace(user_id: int) -> dict[str, int | str]:
    """Stage demo data for an empty account. Caller is responsible for commit/rollback."""
    if _has_financial_data(user_id):
        raise DemoDataConflictError("Demo data can only be loaded into an empty account.")

    profile_seeded_fields = _ensure_profile(user_id)

    current_month = _month_start_for(0).strftime("%Y-%m")
    budgets: list[Budget] = []
    budgets_created = 0
    for category_name, amount_kd in _DEMO_BUDGETS:
        budget, created = _ensure_budget(current_month, category_name, amount_kd, user_id)
        budgets.append(budget)
        budgets_created += int(created)

    transactions: list[Transaction] = []
    for template in _DEMO_TRANSACTIONS:
        txn = _create_demo_transaction(template, user_id)
        if txn is not None:
            transactions.append(txn)

    debt_account, debt_created = _ensure_debt_account(user_id)
    savings_goal, savings_created = _ensure_savings_goal(user_id)
    db.session.flush()

    manifest = DemoWorkspaceManifest(
        month=current_month,
        months_seeded=6,
        transaction_ids=tuple(int(txn.id) for txn in transactions if txn.id is not None),
        budget_ids=tuple(int(budget.id) for budget in budgets if budget.id is not None),
        debt_account_ids=(int(debt_account.id),) if debt_account.id is not None else (),
        savings_goal_ids=(int(savings_goal.id),) if savings_goal.id is not None else (),
        profile_seeded_fields=tuple(profile_seeded_fields),
    )
    _record_demo_manifest(user_id, manifest)
    record_event_once(
        DEMO_DATA_EVENT,
        user_id,
        properties={
            "transactions_created": len(manifest.transaction_ids),
            "budgets_created": budgets_created,
            "months_seeded": manifest.months_seeded,
        },
        commit=False,
    )

    return {
        "month": current_month,
        "transactions_created": len(manifest.transaction_ids),
        "budgets_created": budgets_created,
        "debt_accounts_created": int(debt_created),
        "savings_goals_created": int(savings_created),
        "months_seeded": manifest.months_seeded,
    }


def _demo_transaction_query(user_id: int, manifest: DemoWorkspaceManifest | None):
    q = Transaction.query.filter(Transaction.user_id == int(user_id))
    if manifest and manifest.transaction_ids:
        return q.filter(Transaction.id.in_(manifest.transaction_ids))
    return q.filter(Transaction.source == DEMO_TRANSACTION_SOURCE)


def _demo_budget_query(user_id: int, manifest: DemoWorkspaceManifest | None):
    q = Budget.query.filter(Budget.user_id == int(user_id))
    if manifest and manifest.budget_ids:
        return q.filter(Budget.id.in_(manifest.budget_ids))
    return q.filter(Budget.id == -1)


def _demo_debt_query(user_id: int, manifest: DemoWorkspaceManifest | None):
    q = DebtAccount.query.filter(DebtAccount.user_id == int(user_id))
    if manifest and manifest.debt_account_ids:
        return q.filter(DebtAccount.id.in_(manifest.debt_account_ids))
    return q.filter(DebtAccount.name == "Starter Card")


def _demo_savings_query(user_id: int, manifest: DemoWorkspaceManifest | None):
    q = SavingsGoal.query.filter(SavingsGoal.user_id == int(user_id))
    if manifest and manifest.savings_goal_ids:
        return q.filter(SavingsGoal.id.in_(manifest.savings_goal_ids))
    return q.filter(SavingsGoal.name == "Emergency Buffer")


def _profile_demo_fields_remaining(user_id: int, manifest: DemoWorkspaceManifest | None) -> list[str]:
    profile = UserProfile.query.filter_by(user_id=user_id).first()
    if profile is None:
        return []

    seeded_fields = tuple(manifest.profile_seeded_fields) if manifest else ()
    remaining: list[str] = []
    for field in seeded_fields:
        if field == "monthly_income_kd" and profile.monthly_income_kd == _DEMO_PROFILE_DEFAULTS["monthly_income_kd"]:
            remaining.append(field)
        elif field == "payday_day" and int(profile.payday_day or 0) == int(_DEMO_PROFILE_DEFAULTS["payday_day"]):
            remaining.append(field)
        elif field == "country" and (profile.country or "").strip() == str(_DEMO_PROFILE_DEFAULTS["country"]):
            remaining.append(field)
    return remaining


def get_demo_workspace_state(user_id: int) -> dict[str, Any]:
    manifest = _latest_manifest(user_id)
    loaded_event = _latest_event(user_id, DEMO_DATA_EVENT)

    transaction_count = int(_demo_transaction_query(user_id, manifest).count())
    budget_count = int(_demo_budget_query(user_id, manifest).count())
    debt_count = int(_demo_debt_query(user_id, manifest).count())
    savings_count = int(_demo_savings_query(user_id, manifest).count())
    profile_fields = _profile_demo_fields_remaining(user_id, manifest)

    active = any([
        transaction_count > 0,
        budget_count > 0,
        debt_count > 0,
        savings_count > 0,
        len(profile_fields) > 0,
    ])

    loaded_at = None
    source_event = _latest_event(user_id, DEMO_MANIFEST_EVENT) or loaded_event
    if source_event and source_event.event_ts:
        loaded_at = source_event.event_ts.isoformat()

    months_seeded = manifest.months_seeded if manifest else 6
    month = manifest.month if manifest else _month_start_for(0).strftime("%Y-%m")

    return {
        "active": active,
        "clearable": active,
        "loaded_at": loaded_at,
        "month": month,
        "months_seeded": months_seeded,
        "transactions": transaction_count,
        "budgets": budget_count,
        "debt_accounts": debt_count,
        "savings_goals": savings_count,
        "profile_seeded_fields": profile_fields,
    }


def clear_demo_workspace(user_id: int) -> dict[str, Any]:
    manifest = _latest_manifest(user_id)
    state = get_demo_workspace_state(user_id)
    if not state["active"]:
        raise DemoDataNotLoadedError("No active demo workspace was found.")

    transactions = _demo_transaction_query(user_id, manifest).all()
    for txn in transactions:
        db.session.delete(txn)

    budgets_deleted = _demo_budget_query(user_id, manifest).delete(synchronize_session=False)
    debt_deleted = _demo_debt_query(user_id, manifest).delete(synchronize_session=False)
    savings_deleted = _demo_savings_query(user_id, manifest).delete(synchronize_session=False)

    profile_cleared_fields: list[str] = []
    profile = UserProfile.query.filter_by(user_id=user_id).first()
    if profile is not None:
        for field in state["profile_seeded_fields"]:
            if field == "monthly_income_kd":
                profile.monthly_income_kd = None
            elif field == "payday_day":
                profile.payday_day = None
            elif field == "country":
                profile.country = None
            else:
                continue
            profile_cleared_fields.append(field)

    summary = {
        "transactions_cleared": len(transactions),
        "budgets_cleared": int(budgets_deleted or 0),
        "debt_accounts_cleared": int(debt_deleted or 0),
        "savings_goals_cleared": int(savings_deleted or 0),
        "profile_fields_cleared": profile_cleared_fields,
    }
    record_event(
        DEMO_CLEARED_EVENT,
        user_id,
        properties=summary,
        commit=False,
    )
    return summary
