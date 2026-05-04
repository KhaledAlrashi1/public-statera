"""Category CRUD routes."""

from flask import Blueprint, request, current_app
from flask_login import login_required, current_user
from sqlalchemy import func

from backend import db
from backend.api_response import ok_response, error_response
from backend.constants import UNCAT_NAME
from backend.models import Budget, Category, MemorizedTransaction, SavingsGoal, Transaction
from backend.lib.cache import cache_bust_dashboard_metrics
from backend.lib.categories import (
    find_category_by_name,
    get_uncategorized,
    list_categories_for_user,
)

bp = Blueprint("categories", __name__)


def _serialize_categories_with_counts(categories: list[Category], *, user_id: int) -> list[dict]:
    if not categories:
        return []

    category_ids = [int(c.id) for c in categories if c.id is not None]
    txn_counts = {
        int(category_id): int(count)
        for category_id, count in (
            db.session.query(
                Transaction.category_id,
                func.count(Transaction.id),
            )
            .filter(Transaction.user_id == user_id)
            .filter(Transaction.category_id.in_(category_ids))
            .group_by(Transaction.category_id)
            .all()
        )
    }

    items: list[dict] = []
    for c in categories:
        item = c.to_dict()
        item["transaction_count"] = txn_counts.get(int(c.id), 0)
        items.append(item)
    return items


def _dependent_counts(category_id: int, user_id: int) -> dict:
    """Return counts of all rows that reference this category."""
    txn_count = (
        Transaction.query
        .filter(Transaction.category_id == category_id, Transaction.user_id == user_id)
        .count()
    )
    budget_count = (
        Budget.query
        .filter(Budget.category_id == category_id, Budget.user_id == user_id)
        .count()
    )
    goal_count = (
        SavingsGoal.query
        .filter(SavingsGoal.linked_category_id == category_id, SavingsGoal.user_id == user_id)
        .count()
    )
    memorized_count = (
        MemorizedTransaction.query
        .filter(MemorizedTransaction.category_id == category_id, MemorizedTransaction.user_id == user_id)
        .count()
    )
    return {
        "transactions": txn_count,
        "budgets": budget_count,
        "goals": goal_count,
        "memorized": memorized_count,
    }


def _remap_category(source_id: int, target_id: int, user_id: int) -> dict:
    """Reassign all dependents from source category to target.

    Raises ValueError with a JSON-serialisable payload on budget conflict.
    Returns counts dict on success (does NOT commit).
    """
    conflicting_periods: list[str] = []
    source_budget_months = {
        row[0] for row in (
            Budget.query
            .with_entities(Budget.month)
            .filter(Budget.category_id == source_id, Budget.user_id == user_id)
            .all()
        )
    }
    if source_budget_months:
        target_budget_months = {
            row[0] for row in (
                Budget.query
                .with_entities(Budget.month)
                .filter(Budget.category_id == target_id, Budget.user_id == user_id)
                .all()
            )
        }
        conflicting_periods = sorted(source_budget_months & target_budget_months)

    if conflicting_periods:
        raise ValueError(
            {
                "error": "budget_conflict",
                "message": "Both categories have budgets for the same period(s). Resolve before reassigning.",
                "conflicting_periods": conflicting_periods,
            }
        )

    txn_count = (
        Transaction.query
        .filter(Transaction.user_id == user_id, Transaction.category_id == source_id)
        .update({Transaction.category_id: target_id}, synchronize_session=False)
    )
    budget_count = (
        Budget.query
        .filter(Budget.user_id == user_id, Budget.category_id == source_id)
        .update({Budget.category_id: target_id}, synchronize_session=False)
    )
    goal_count = (
        SavingsGoal.query
        .filter(SavingsGoal.user_id == user_id, SavingsGoal.linked_category_id == source_id)
        .update({SavingsGoal.linked_category_id: target_id}, synchronize_session=False)
    )
    memorized_count = (
        MemorizedTransaction.query
        .filter(MemorizedTransaction.user_id == user_id, MemorizedTransaction.category_id == source_id)
        .update({MemorizedTransaction.category_id: target_id}, synchronize_session=False)
    )
    return {
        "remapped_count": int(txn_count or 0),
        "budget_count": int(budget_count or 0),
        "goal_count": int(goal_count or 0),
        "memorized_count": int(memorized_count or 0),
    }


@bp.route("/api/categories", methods=["GET", "POST"])
@login_required
def api_categories():
    if request.method == "GET":
        cats = list_categories_for_user(current_user.id)
        items = _serialize_categories_with_counts(cats, user_id=int(current_user.id))
        return ok_response(data={"items": items}, legacy={"items": items})

    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return error_response("Name is required.", status=400, code="validation_error")
    if len(name) > 64:
        return error_response("Name too long (max 64 characters).", status=400, code="validation_error")
    is_income = bool(payload.get("is_income"))

    existing = find_category_by_name(name, current_user.id)
    if existing:
        item = existing.to_dict()
        return ok_response(data={"item": item}, legacy={"item": item}, status=200)

    cat = Category(name=name, user_id=current_user.id, is_income=is_income)
    db.session.add(cat)
    db.session.commit()
    item = cat.to_dict()
    return ok_response(data={"item": item}, legacy={"item": item}, status=201)


@bp.route("/api/categories/<int:cat_id>/delete", methods=["POST"])
@login_required
def api_delete_category(cat_id: int):
    """Delete a user-owned category.

    Behaviour:
      - System categories → 403.
      - No dependents → hard delete, 200.
      - Dependents present, no reassign_to → 409 with counts.
      - Dependents present, reassign_to provided → remap then delete, 200.
      - Budget conflict during remap → 409 with conflicting_periods.
    """
    cat = (
        Category.query
        .filter(Category.id == cat_id, Category.user_id == current_user.id)
        .first_or_404()
    )

    if cat.is_system:
        return error_response(
            f"'{cat.name}' is a system category and cannot be deleted.",
            status=403,
            code="system_category_protected",
        )

    payload = request.get_json(silent=True) or {}
    reassign_to = payload.get("reassign_to")

    counts = _dependent_counts(cat_id, current_user.id)
    has_dependents = any(counts.values())

    if has_dependents and reassign_to is None:
        return error_response(
            "This category has dependent rows. Provide 'reassign_to' to move them first.",
            status=409,
            code="has_dependents",
            extra={"dependent_counts": counts},
        )

    try:
        if has_dependents:
            try:
                target_id = int(reassign_to)
            except (TypeError, ValueError):
                return error_response("'reassign_to' must be a category id.", status=400, code="validation_error")

            if target_id == cat_id:
                return error_response("'reassign_to' must be a different category.", status=400, code="validation_error")

            target = (
                Category.query
                .filter(Category.id == target_id, Category.user_id == current_user.id)
                .first_or_404()
            )
            _ = target  # confirm it exists and belongs to the user

            try:
                _remap_category(cat_id, target_id, current_user.id)
            except ValueError as conflict:
                conflict_payload = conflict.args[0]
                return error_response(
                    conflict_payload["message"],
                    status=409,
                    code=conflict_payload["error"],
                    extra={"conflicting_periods": conflict_payload["conflicting_periods"]},
                )

        db.session.delete(cat)
        db.session.commit()
        cache_bust_dashboard_metrics(current_user.id)
        return ok_response(data={"deleted": True}, legacy={"deleted": True})

    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception("Category delete failed for cat_id=%s user_id=%s", cat_id, current_user.id)
        return error_response("Failed to delete category.", status=500, code="internal_error")


@bp.route("/api/categories/<int:source_id>/remap", methods=["POST"])
@login_required
def api_remap_category(source_id: int):
    """Remap all dependents from source category to target and optionally delete source."""
    payload = request.get_json(silent=True) or {}
    try:
        target_id = int(payload.get("target_id"))
    except (TypeError, ValueError):
        return error_response("target_id is required.", status=400, code="validation_error")

    if source_id == target_id:
        return error_response("source_id and target_id must be different.", status=400, code="validation_error")

    source = (
        Category.query
        .filter(Category.id == source_id, Category.user_id == current_user.id)
        .first_or_404()
    )
    target = (
        Category.query
        .filter(Category.id == target_id, Category.user_id == current_user.id)
        .first_or_404()
    )

    uncategorized = get_uncategorized(current_user.id)
    if int(source.id) == int(uncategorized.id) or source.name.lower() == UNCAT_NAME.lower():
        return error_response(
            "Cannot remap the Uncategorized category.",
            status=400,
            code="validation_error",
        )

    _ = target  # accessed only to verify ownership

    try:
        remap_counts = _remap_category(source_id, target_id, current_user.id)
    except ValueError as conflict:
        conflict_payload = conflict.args[0]
        return error_response(
            conflict_payload["message"],
            status=409,
            code=conflict_payload["error"],
            extra={"conflicting_periods": conflict_payload["conflicting_periods"]},
        )

    try:
        db.session.commit()
        cache_bust_dashboard_metrics(current_user.id)
        return ok_response(data=remap_counts, legacy=remap_counts)
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception(
            "Category remap failed for source_id=%s target_id=%s user_id=%s",
            source_id, target_id, current_user.id,
        )
        return error_response("Failed to remap category.", status=500, code="internal_error")
