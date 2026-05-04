"""Savings goals CRUD routes."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, current_app, request
from flask_login import current_user, login_required
from sqlalchemy import update

from backend import db
from backend.api_response import error_response, ok_response
from backend.constants import RATE_LIMIT_SEARCH
from backend.lib.cache import cache_bust_dashboard_metrics, cache_bust_safe_to_spend
from backend.lib.categories import find_category_by_name
from backend.lib.savings_goals import goal_projection
from backend.money_math import format_kd
from backend.models import SavingsGoal
from backend.security_ops import rate_limit
from backend.product_events import record_event, record_event_once

bp = Blueprint("goals", __name__)

_ALLOWED_GOAL_TYPES = {"starter_buffer", "emergency_fund", "custom"}
_MAX_AMOUNT = Decimal("999999999.999")


def _to_bool(value: str | None, *, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_name(value: object) -> str:
    name = str(value or "").strip()
    if not name:
        raise ValueError("name is required")
    if len(name) > 128:
        raise ValueError("name must be 128 characters or fewer")
    return name


def _parse_goal_type(value: object) -> str:
    normalized = (str(value or "").strip().lower() or "custom")
    if normalized not in _ALLOWED_GOAL_TYPES:
        raise ValueError("goal_type must be one of: starter_buffer, emergency_fund, custom")
    return normalized


def _parse_amount(
    value: object,
    *,
    field_name: str,
    allow_none: bool = False,
    allow_zero: bool = True,
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
    if not allow_zero and parsed == 0:
        raise ValueError(f"{field_name} must be greater than zero")
    if parsed > _MAX_AMOUNT:
        raise ValueError(f"{field_name} is too large")
    return parsed


def _parse_target_date(
    value: object,
    *,
    allow_none: bool = False,
    existing_date: date | None = None,
) -> date | None:
    if value is None:
        if allow_none:
            return None
        raise ValueError("target_date is required")
    raw = str(value).strip()
    if raw == "":
        if allow_none:
            return None
        raise ValueError("target_date is required")
    try:
        parsed = date.fromisoformat(raw)
    except Exception:  # noqa: BLE001 - goal routes should rollback or skip non-critical work on unexpected failures.
        raise ValueError("target_date must use YYYY-MM-DD format") from None
    if parsed != existing_date and parsed < datetime.now(timezone.utc).date():
        raise ValueError("target_date cannot be in the past")
    return parsed


def _resolve_linked_category_id(value: object, user_id: int) -> int | None:
    """Resolve a linked_category name string to a category id.

    Returns None when value is empty or no matching category is found
    (unmatched values silently become NULL — per approved migration decision).
    """
    if value is None:
        return None
    name = str(value).strip()
    if not name:
        return None
    if len(name) > 64:
        raise ValueError("linked_category must be 64 characters or fewer")
    cat = find_category_by_name(name, user_id)
    return cat.id if cat else None


def _parse_notes(value: object) -> str | None:
    if value is None:
        return None
    notes = str(value).strip()
    if not notes:
        return None
    if len(notes) > 255:
        raise ValueError("notes must be 255 characters or fewer")
    return notes


def _validate_goal_amounts(*, target_kd: Decimal | None, current_kd: Decimal | None) -> None:
    target = target_kd if target_kd is not None else Decimal("0")
    current = current_kd if current_kd is not None else Decimal("0")
    if current > target:
        raise ValueError("current_kd cannot exceed target_kd")


def _goal_to_dict_with_projection(goal: SavingsGoal) -> dict:
    payload = goal.to_dict()
    payload["projection"] = goal_projection(goal)
    return payload


def _deposit_failure_response(goal_id: int, amount: Decimal):
    goal = SavingsGoal.query.filter_by(id=goal_id, user_id=current_user.id).first()
    if not goal:
        return error_response("Savings goal not found.", status=404, code="not_found")
    if not goal.is_active:
        return error_response("Savings goal is inactive.", status=409, code="goal_inactive")

    current_amount = goal.current_kd or Decimal("0")
    target_amount = goal.target_kd or Decimal("0")
    if current_amount >= target_amount:
        return error_response("Goal is already fully funded.", status=409, code="goal_fully_funded")
    if current_amount + amount > target_amount:
        return error_response("amount_kd would exceed the goal target", status=400, code="validation_error")

    return error_response(
        "Savings goal deposit could not be applied. Please try again.",
        status=409,
        code="goal_deposit_conflict",
    )


def _apply_goal_deposit(*, goal_id: int, user_id: int, amount: Decimal) -> dict | None:
    updated = db.session.execute(
        update(SavingsGoal)
        .where(SavingsGoal.id == goal_id)
        .where(SavingsGoal.user_id == user_id)
        .where(SavingsGoal.is_active.is_(True))
        .where(SavingsGoal.current_kd < SavingsGoal.target_kd)
        .where(SavingsGoal.current_kd + amount <= SavingsGoal.target_kd)
        .values(
            current_kd=SavingsGoal.current_kd + amount,
            updated_at=datetime.now(timezone.utc),
        )
        .returning(
            SavingsGoal.id,
            SavingsGoal.name,
            SavingsGoal.target_kd,
            SavingsGoal.current_kd,
        )
    ).mappings().first()
    return dict(updated) if updated else None


@bp.route("/api/savings-goals", methods=["GET"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_list_savings_goals():
    include_inactive = _to_bool(request.args.get("include_inactive"), default=False)
    query = SavingsGoal.query.filter_by(user_id=current_user.id)
    if not include_inactive:
        query = query.filter(SavingsGoal.is_active.is_(True))

    rows = query.order_by(SavingsGoal.created_at.desc(), SavingsGoal.id.desc()).all()
    payload = {
        "goals": [_goal_to_dict_with_projection(row) for row in rows],
        "include_inactive": include_inactive,
    }
    return ok_response(data=payload, legacy=payload, meta={"count": len(rows)})


@bp.route("/api/savings-goals/<int:goal_id>/projection", methods=["GET"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_savings_goal_projection(goal_id: int):
    goal = SavingsGoal.query.filter_by(id=goal_id, user_id=current_user.id).first()
    if not goal:
        return error_response("Savings goal not found.", status=404, code="not_found")

    projection = goal_projection(goal)
    payload = {"projection": projection}
    return ok_response(data=payload, legacy=payload)


@bp.route("/api/savings-goals", methods=["POST"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_create_savings_goal():
    body = request.get_json(silent=True) or {}
    try:
        target_kd = _parse_amount(
            body.get("target_kd"),
            field_name="target_kd",
            allow_zero=False,
        )
        current_kd = _parse_amount(
            body.get("current_kd", "0"),
            field_name="current_kd",
            allow_zero=True,
        )
        _validate_goal_amounts(target_kd=target_kd, current_kd=current_kd)
        goal = SavingsGoal(
            user_id=current_user.id,
            name=_parse_name(body.get("name")),
            goal_type=_parse_goal_type(body.get("goal_type")),
            target_kd=target_kd,
            current_kd=current_kd,
            target_date=_parse_target_date(body.get("target_date"), allow_none=True),
            linked_category_id=_resolve_linked_category_id(body.get("linked_category"), current_user.id),
            notes=_parse_notes(body.get("notes")),
        )
    except ValueError as exc:
        return error_response(str(exc), status=400, code="validation_error")

    db.session.add(goal)
    db.session.commit()
    cache_bust_dashboard_metrics(current_user.id)
    cache_bust_safe_to_spend(current_user.id)
    payload = {"goal": _goal_to_dict_with_projection(goal)}
    return ok_response(data=payload, legacy=payload, status=201)


@bp.route("/api/savings-goals/<int:goal_id>/update", methods=["POST"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_update_savings_goal(goal_id: int):
    goal = SavingsGoal.query.filter_by(id=goal_id, user_id=current_user.id).first()
    if not goal:
        return error_response("Savings goal not found.", status=404, code="not_found")

    body = request.get_json(silent=True) or {}
    try:
        next_name = goal.name
        next_goal_type = goal.goal_type
        next_target_kd = goal.target_kd
        next_current_kd = goal.current_kd
        next_target_date = goal.target_date
        next_linked_category_id = goal.linked_category_id
        next_notes = goal.notes

        if "name" in body:
            next_name = _parse_name(body.get("name"))
        if "goal_type" in body:
            next_goal_type = _parse_goal_type(body.get("goal_type"))
        if "target_kd" in body:
            next_target_kd = _parse_amount(
                body.get("target_kd"),
                field_name="target_kd",
                allow_zero=False,
            )
        if "current_kd" in body:
            next_current_kd = _parse_amount(
                body.get("current_kd"),
                field_name="current_kd",
                allow_zero=True,
            )
        if "target_kd" in body or "current_kd" in body:
            _validate_goal_amounts(target_kd=next_target_kd, current_kd=next_current_kd)
        if "target_date" in body:
            next_target_date = _parse_target_date(
                body.get("target_date"),
                allow_none=True,
                existing_date=goal.target_date,
            )
        if "linked_category" in body:
            next_linked_category_id = _resolve_linked_category_id(body.get("linked_category"), current_user.id)
        if "notes" in body:
            next_notes = _parse_notes(body.get("notes"))
    except ValueError as exc:
        return error_response(str(exc), status=400, code="validation_error")

    goal.name = next_name
    goal.goal_type = next_goal_type
    goal.target_kd = next_target_kd
    goal.current_kd = next_current_kd
    goal.target_date = next_target_date
    goal.linked_category_id = next_linked_category_id
    goal.notes = next_notes

    db.session.commit()
    cache_bust_dashboard_metrics(current_user.id)
    cache_bust_safe_to_spend(current_user.id)
    payload = {"goal": _goal_to_dict_with_projection(goal)}
    return ok_response(data=payload, legacy=payload)


@bp.route("/api/savings-goals/<int:goal_id>/deposit", methods=["POST"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_deposit_savings_goal(goal_id: int):
    body = request.get_json(silent=True) or {}
    try:
        amount = _parse_amount(
            body.get("amount_kd"),
            field_name="amount_kd",
            allow_zero=False,
        )
    except ValueError as exc:
        return error_response(str(exc), status=400, code="validation_error")

    updated_goal = _apply_goal_deposit(goal_id=goal_id, user_id=current_user.id, amount=amount)
    if updated_goal is None:
        return _deposit_failure_response(goal_id, amount)

    current_amount = updated_goal["current_kd"] or Decimal("0")
    target_amount = updated_goal["target_kd"] or Decimal("0")
    previous_current = current_amount - amount
    record_event(
        "savings_goal.deposit",
        current_user.id,
        properties={
            "goal_id": updated_goal["id"],
            "goal_name": updated_goal["name"],
            "amount_kd": format_kd(amount),
        },
        commit=False,
    )

    milestones_crossed: list[int] = []
    if target_amount > 0:
        before_pct = (previous_current / target_amount) * Decimal("100")
        after_pct = (current_amount / target_amount) * Decimal("100")
        for marker in (25, 50, 75, 100):
            marker_pct = Decimal(str(marker))
            if before_pct < marker_pct <= after_pct:
                event_name = f"goal_milestone_{updated_goal['id']}_{marker}"[:64]
                inserted = record_event_once(
                    event_name,
                    current_user.id,
                    properties={
                        "goal_id": updated_goal["id"],
                        "goal_name": updated_goal["name"],
                        "milestone_pct": marker,
                        "current_kd": format_kd(current_amount),
                        "target_kd": format_kd(target_amount),
                    },
                    commit=False,
                )
                if inserted:
                    milestones_crossed.append(marker)

    db.session.commit()
    goal = SavingsGoal.query.filter_by(id=goal_id, user_id=current_user.id).first()
    if not goal:
        return error_response("Savings goal not found.", status=404, code="not_found")
    cache_bust_dashboard_metrics(current_user.id)
    cache_bust_safe_to_spend(current_user.id)
    if milestones_crossed:
        try:
            from backend.tasks import send_goal_milestone_email

            for marker in milestones_crossed:
                send_goal_milestone_email.delay(
                    user_id=current_user.id,
                    goal_name=goal.name,
                    milestone_pct=marker,
                    current_kd=format_kd(goal.current_kd),
                    target_kd=format_kd(goal.target_kd),
                )
        except Exception:  # noqa: BLE001 - goal routes should rollback or skip non-critical work on unexpected failures.
            # Email dispatch failures should not fail the deposit transaction.
            current_app.logger.exception(
                "Failed to enqueue goal milestone email user_id=%s goal_id=%s",
                current_user.id,
                goal.id,
            )

    payload = {"goal": _goal_to_dict_with_projection(goal)}
    return ok_response(data=payload, legacy=payload)


@bp.route("/api/savings-goals/<int:goal_id>/delete", methods=["POST"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_delete_savings_goal(goal_id: int):
    goal = SavingsGoal.query.filter_by(id=goal_id, user_id=current_user.id).first()
    if not goal:
        return error_response("Savings goal not found.", status=404, code="not_found")

    goal.is_active = False
    db.session.commit()
    cache_bust_dashboard_metrics(current_user.id)
    cache_bust_safe_to_spend(current_user.id)
    payload = {"goal": _goal_to_dict_with_projection(goal)}
    return ok_response(data=payload, legacy=payload)
