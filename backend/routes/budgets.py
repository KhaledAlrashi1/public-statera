"""Budget CRUD routes."""

import re
from decimal import Decimal, InvalidOperation

from flask import Blueprint, request, current_app
from flask_login import login_required, current_user

from backend import db
from backend.api_response import ok_response, error_response
from backend.constants import UNCAT_NAME
from backend.models import Category, Budget, UserProfile
from backend.lib.categories import get_or_create_category
from backend.lib.income import resolve_income_for_period
from backend.lib.importer import _parse_amount
from backend.money_math import format_kd, to_display_float
from backend.product_events import record_event, record_event_once

bp = Blueprint("budgets", __name__)
_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _budget_profile_context(user_id: int, month: str, items: list[dict]) -> dict:
    budget_total = Decimal("0")
    for row in items:
        try:
            budget_total += Decimal(str(row.get("amount_kd") or 0))
        except (TypeError, ValueError, InvalidOperation):
            continue

    profile = UserProfile.query.filter_by(user_id=user_id).first()
    income_resolution = resolve_income_for_period(user_id, month)
    income_kd = income_resolution.amount_kd

    context = {
        "budget_total_kd": to_display_float(budget_total),
        "monthly_income_kd": to_display_float(income_kd) if income_kd is not None else None,
        "income_source": income_resolution.source,
        "budget_to_income_pct": None,
        "payday_day": profile.payday_day if profile else None,
    }
    if income_kd and income_kd > 0:
        context["budget_to_income_pct"] = to_display_float(
            (budget_total / income_kd) * Decimal("100"), places=Decimal("0.1")
        )
    return context


def _serialize_budget_rows(rows: list[tuple[Budget, str | None]]) -> list[dict]:
    items: list[dict] = []
    for budget_row, category_name in rows:
        items.append({
            "id": budget_row.id,
            "month": budget_row.month,
            "category": category_name or UNCAT_NAME,
            "amount_kd": format_kd(budget_row.amount_kd),
        })
    return items


def build_budget_payload(user_id: int, month: str) -> dict:
    rows = (
        db.session.query(Budget, Category.name)
        .outerjoin(Category, Budget.category_id == Category.id)
        .filter(Budget.month == month)
        .filter(Budget.user_id == user_id)
        .order_by(Category.name.asc())
        .all()
    )

    items = _serialize_budget_rows(rows)
    return {
        "month": month,
        "items": items,
        "profile_context": _budget_profile_context(user_id, month, items),
    }


@bp.route("/api/budgets/months", methods=["GET"])
@login_required
def api_budgets_months():
    """Return distinct months that have at least one budget for the current user."""
    from sqlalchemy import distinct
    rows = (
        db.session.query(distinct(Budget.month))
        .filter(Budget.user_id == current_user.id)
        .order_by(Budget.month.desc())
        .all()
    )
    months = [row[0] for row in rows]
    return ok_response({"months": months})


@bp.route("/api/budgets", methods=["GET", "POST"])
@login_required
def api_budgets():
    if request.method == "GET":
        month = (request.args.get("month") or "").strip()
        if not month:
            return error_response("month is required (YYYY-MM)", status=400, code="validation_error")
        if not _MONTH_RE.match(month):
            return error_response("month must be in YYYY-MM format", status=400, code="validation_error")

        payload = build_budget_payload(current_user.id, month)
        return ok_response(data=payload, legacy=payload)

    # POST
    payload = request.get_json(silent=True) or {}
    month = (payload.get("month") or "").strip()
    items_raw = payload.get("items") or []
    if not month or not isinstance(items_raw, list):
        return error_response("month and items[] are required", status=400, code="validation_error")
    if not _MONTH_RE.match(month):
        return error_response("month must be in YYYY-MM format", status=400, code="validation_error")

    # --- Validate all items BEFORE touching the database ---
    seen = {}
    seen_labels = {}
    duplicate_labels = {}
    for it in items_raw:
        cat_name = (it.get("category") or "").strip()
        if not cat_name:
            continue
        key = cat_name.lower()
        if key in seen:
            duplicate_labels.setdefault(key, seen_labels[key])
            continue
        seen[key] = it
        seen_labels[key] = cat_name

    if duplicate_labels:
        duplicates = sorted(duplicate_labels.values(), key=str.lower)
        return error_response(
            f"Duplicate categories: {', '.join(duplicates)}",
            status=400,
            code="budget_duplicate_category",
            meta={"duplicate_categories": duplicates},
        )

    # Parse and validate every amount up-front so a bad entry never causes a
    # partial delete-then-500; bad input gets a clean 400 with no DB side-effects.
    validated = []
    for it in seen.values():
        cat_name = (it.get("category") or "").strip()
        try:
            amt = _parse_amount(str(it.get("amount_kd") or ""))
        except InvalidOperation:
            return error_response(
                f"Budget amount for '{cat_name}' must be a valid number.",
                status=400,
                code="validation_error",
            )
        if amt <= 0:
            return error_response(
                f"Budget amount for '{cat_name}' must be greater than zero.",
                status=400,
                code="validation_error",
            )
        if amt > Decimal("999999.999"):
            return error_response(
                f"Budget amount for '{cat_name}' is too large.",
                status=400,
                code="validation_error",
            )
        validated.append((cat_name, amt))

    # --- Database operations (all validation passed) ---
    try:
        Budget.query.filter(Budget.month == month, Budget.user_id == current_user.id).delete(synchronize_session=False)

        cat_cache = {}
        to_add = []
        for cat_name, amt in validated:
            key = cat_name.lower()
            if key in cat_cache:
                cat = cat_cache[key]
            else:
                cat = get_or_create_category(cat_name, current_user.id)
                cat_cache[key] = cat
            to_add.append(Budget(month=month, category_id=cat.id, amount_kd=amt, user_id=current_user.id))

        if to_add:
            db.session.bulk_save_objects(to_add)

        db.session.commit()

        if to_add:
            try:
                record_event(
                    "budget_saved",
                    current_user.id,
                    properties={"month": month, "categories": len(to_add)},
                    commit=False,
                )
                record_event_once(
                    "first_budget_set",
                    current_user.id,
                    properties={"month": month, "categories": len(to_add)},
                    commit=False,
                )
                db.session.commit()
            except Exception:  # noqa: BLE001 - budget routes should not fail the request because of secondary side effects.
                db.session.rollback()
                current_app.logger.exception(
                    "Failed to record first_budget_set event for user_id=%s month=%s",
                    current_user.id,
                    month,
                )

        response_payload = build_budget_payload(current_user.id, month)
        return ok_response(data=response_payload, legacy=response_payload)
    except Exception:  # noqa: BLE001 - budget routes should not fail the request because of secondary side effects.
        db.session.rollback()
        current_app.logger.exception("Budget save failed for user_id=%s month=%s", current_user.id, month)
        return error_response("Failed to save budgets.", status=500, code="budget_save_failed")
