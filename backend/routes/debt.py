"""Debt account CRUD routes."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, request
from flask_login import current_user, login_required
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from backend import db
from backend.api_response import error_response, ok_response
from backend.constants import RATE_LIMIT_SEARCH
from backend.debt_calculator import (
    avalanche_plan,
    minimum_required_payment,
    snowball_plan,
)
from backend.lib.cache import cache_bust_safe_to_spend
from backend.security_ops import rate_limit
from backend.models import DebtAccount
from backend.money_math import format_kd

bp = Blueprint("debt", __name__)

_ALLOWED_DEBT_TYPES = {"credit_card", "personal_loan", "car_loan", "other"}
_MAX_BALANCE = Decimal("999999999.999")
_MAX_MINIMUM = Decimal("9999999.999")
_MAX_APR = Decimal("999.999")


def _to_bool(value: str | None, *, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_non_negative_decimal(
    value: object,
    *,
    field_name: str,
    allow_none: bool = False,
    max_value: Decimal | None = None,
) -> Decimal | None:
    if value is None:
        if allow_none:
            return None
        raise ValueError(f"{field_name} is required")
    raw = str(value).strip()
    if raw == "":
        if allow_none:
            return None
        raise ValueError(f"{field_name} is required")

    try:
        parsed = Decimal(raw)
    except (InvalidOperation, ValueError):
        raise ValueError(f"{field_name} must be a valid number") from None

    if parsed < 0:
        raise ValueError(f"{field_name} must be greater than or equal to zero")
    if max_value is not None and parsed > max_value:
        raise ValueError(f"{field_name} is too large")
    return parsed


def _parse_due_day(value: object, *, allow_none: bool) -> int | None:
    if value is None:
        if allow_none:
            return None
        raise ValueError("due_day is required")
    raw = str(value).strip()
    if raw == "":
        if allow_none:
            return None
        raise ValueError("due_day is required")
    try:
        parsed = int(raw)
    except Exception:  # noqa: BLE001 - the route should rollback and return a generic error instead of leaking partial state.
        raise ValueError("due_day must be an integer between 1 and 31") from None
    if parsed < 1 or parsed > 31:
        raise ValueError("due_day must be between 1 and 31")
    return parsed


def _parse_debt_type(value: object) -> str:
    normalized = (str(value or "").strip().lower() or "other")
    if normalized not in _ALLOWED_DEBT_TYPES:
        raise ValueError(
            "debt_type must be one of: credit_card, personal_loan, car_loan, other"
        )
    return normalized


def _parse_name(value: object) -> str:
    name = str(value or "").strip()
    if not name:
        raise ValueError("name is required")
    if len(name) > 128:
        raise ValueError("name must be 128 characters or fewer")
    return name


def _parse_notes(value: object) -> str | None:
    if value is None:
        return None
    notes = str(value).strip()
    if not notes:
        return None
    if len(notes) > 255:
        raise ValueError("notes must be 255 characters or fewer")
    return notes


@bp.route("/api/debt-accounts", methods=["GET"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_list_debt_accounts():
    include_inactive = _to_bool(request.args.get("include_inactive"), default=False)

    query = DebtAccount.query.filter_by(user_id=current_user.id)
    if not include_inactive:
        query = query.filter(DebtAccount.is_active.is_(True))

    rows = query.order_by(DebtAccount.name.asc(), DebtAccount.id.asc()).all()
    payload = {
        "accounts": [row.to_dict() for row in rows],
        "include_inactive": include_inactive,
    }
    return ok_response(data=payload, legacy=payload, meta={"count": len(rows)})


@bp.route("/api/debt-accounts/summary", methods=["GET"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_debt_accounts_summary():
    payload = build_debt_summary_payload(current_user.id)
    return ok_response(data=payload, legacy=payload)


def build_debt_summary_payload(user_id: int) -> dict:
    row = (
        db.session.query(
            func.coalesce(func.sum(DebtAccount.balance_kd), 0),
            func.coalesce(func.sum(DebtAccount.minimum_payment_kd), 0),
            func.count(DebtAccount.id),
        )
        .filter(DebtAccount.user_id == user_id)
        .filter(DebtAccount.is_active.is_(True))
        .first()
    )
    total_balance = row[0] if row else Decimal("0")
    total_minimum = row[1] if row else Decimal("0")
    account_count = int(row[2] if row else 0)

    payload = {
        "total_balance_kd": format_kd(total_balance),
        "total_minimum_kd": format_kd(total_minimum),
        "account_count": account_count,
    }
    return payload


@bp.route("/api/debt-accounts/payoff-plan", methods=["GET"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_debt_accounts_payoff_plan():
    monthly_payment_raw = (request.args.get("monthly_payment") or "").strip()
    if not monthly_payment_raw:
        return error_response("monthly_payment is required", status=400, code="validation_error")

    try:
        monthly_payment = _parse_non_negative_decimal(
            monthly_payment_raw,
            field_name="monthly_payment",
            max_value=_MAX_BALANCE,
        )
    except ValueError as exc:
        return error_response(str(exc), status=400, code="validation_error")

    if monthly_payment is None or monthly_payment <= 0:
        return error_response(
            "monthly_payment must be greater than zero",
            status=400,
            code="validation_error",
        )

    rows = (
        DebtAccount.query
        .filter(DebtAccount.user_id == current_user.id)
        .filter(DebtAccount.is_active.is_(True))
        .order_by(DebtAccount.name.asc(), DebtAccount.id.asc())
        .all()
    )
    debts = [
        {
            "id": row.id,
            "name": row.name,
            "balance_kd": row.balance_kd,
            "apr_pct": row.apr_pct or Decimal("0"),
            "minimum_payment_kd": row.minimum_payment_kd,
        }
        for row in rows
    ]

    minimum_required = minimum_required_payment(debts)
    if debts and monthly_payment < minimum_required:
        return error_response(
            f"Monthly payment must exceed minimum total of {format_kd(minimum_required)} KD",
            status=400,
            code="PAYMENT_TOO_LOW",
        )

    now = datetime.now(timezone.utc)
    start_date = date(now.year, now.month, 1)
    try:
        avalanche = avalanche_plan(debts, monthly_payment, start_date=start_date)
        snowball = snowball_plan(debts, monthly_payment, start_date=start_date)
    except ValueError as exc:
        return error_response(str(exc), status=400, code="validation_error")

    payload = {
        "avalanche": avalanche,
        "snowball": snowball,
        "minimum_required": format_kd(minimum_required),
    }
    return ok_response(data=payload, legacy=payload)


@bp.route("/api/debt-accounts", methods=["POST"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_create_debt_account():
    body = request.get_json(silent=True) or {}
    try:
        account = DebtAccount(
            user_id=current_user.id,
            name=_parse_name(body.get("name")),
            debt_type=_parse_debt_type(body.get("debt_type")),
            balance_kd=_parse_non_negative_decimal(
                body.get("balance_kd"),
                field_name="balance_kd",
                max_value=_MAX_BALANCE,
            ),
            minimum_payment_kd=_parse_non_negative_decimal(
                body.get("minimum_payment_kd"),
                field_name="minimum_payment_kd",
                max_value=_MAX_MINIMUM,
            ),
            due_day=_parse_due_day(body.get("due_day"), allow_none=True),
            apr_pct=_parse_non_negative_decimal(
                body.get("apr_pct"),
                field_name="apr_pct",
                allow_none=True,
                max_value=_MAX_APR,
            ),
            notes=_parse_notes(body.get("notes")),
        )
    except ValueError as exc:
        return error_response(str(exc), status=400, code="validation_error")

    try:
        db.session.add(account)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error_response(
            "A debt account with this name already exists.",
            status=409,
            code="debt_name_conflict",
        )

    cache_bust_safe_to_spend(current_user.id)
    payload = {"account": account.to_dict()}
    return ok_response(data=payload, legacy=payload, status=201)


@bp.route("/api/debt-accounts/<int:account_id>/update", methods=["POST"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_update_debt_account(account_id: int):
    account = DebtAccount.query.filter_by(
        id=account_id,
        user_id=current_user.id,
    ).first()
    if not account:
        return error_response("Debt account not found.", status=404, code="not_found")

    body = request.get_json(silent=True) or {}

    try:
        if "name" in body:
            account.name = _parse_name(body.get("name"))
        if "debt_type" in body:
            account.debt_type = _parse_debt_type(body.get("debt_type"))
        if "balance_kd" in body:
            account.balance_kd = _parse_non_negative_decimal(
                body.get("balance_kd"),
                field_name="balance_kd",
                max_value=_MAX_BALANCE,
            )
        if "minimum_payment_kd" in body:
            account.minimum_payment_kd = _parse_non_negative_decimal(
                body.get("minimum_payment_kd"),
                field_name="minimum_payment_kd",
                max_value=_MAX_MINIMUM,
            )
        if "due_day" in body:
            account.due_day = _parse_due_day(body.get("due_day"), allow_none=True)
        if "apr_pct" in body:
            account.apr_pct = _parse_non_negative_decimal(
                body.get("apr_pct"),
                field_name="apr_pct",
                allow_none=True,
                max_value=_MAX_APR,
            )
        if "notes" in body:
            account.notes = _parse_notes(body.get("notes"))
    except ValueError as exc:
        return error_response(str(exc), status=400, code="validation_error")

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error_response(
            "A debt account with this name already exists.",
            status=409,
            code="debt_name_conflict",
        )

    cache_bust_safe_to_spend(current_user.id)
    payload = {"account": account.to_dict()}
    return ok_response(data=payload, legacy=payload)


@bp.route("/api/debt-accounts/<int:account_id>/delete", methods=["POST"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_delete_debt_account(account_id: int):
    account = DebtAccount.query.filter_by(
        id=account_id,
        user_id=current_user.id,
    ).first()
    if not account:
        return error_response("Debt account not found.", status=404, code="not_found")

    account.is_active = False
    db.session.commit()

    cache_bust_safe_to_spend(current_user.id)
    payload = {"account": account.to_dict()}
    return ok_response(data=payload, legacy=payload)
