"""Merchant CRUD routes."""

from flask import Blueprint, request, current_app
from flask_login import login_required, current_user
from sqlalchemy.exc import IntegrityError

from backend import db
from backend.api_response import ok_response, error_response
from backend.models import MemorizedTransaction, Merchant, Transaction
from backend.lib.categories import find_merchant_by_name, list_merchants_for_user

bp = Blueprint("merchants", __name__)


def _merchant_transaction_count(merchant_id: int, user_id: int) -> int:
    return (
        Transaction.query
        .filter(Transaction.merchant_id == merchant_id, Transaction.user_id == user_id)
        .count()
    )


def _remap_merchant(source_id: int, target_id: int, user_id: int) -> dict:
    """Reassign all transactions and memorized rows from source to target.
    Does NOT commit. Returns counts dict.
    """
    txn_count = (
        Transaction.query
        .filter(Transaction.user_id == user_id, Transaction.merchant_id == source_id)
        .update({Transaction.merchant_id: target_id}, synchronize_session=False)
    )
    memorized_count = (
        MemorizedTransaction.query
        .filter(MemorizedTransaction.user_id == user_id, MemorizedTransaction.merchant_id == source_id)
        .update({MemorizedTransaction.merchant_id: target_id}, synchronize_session=False)
    )
    return {
        "remapped_count": int(txn_count or 0),
        "memorized_count": int(memorized_count or 0),
    }


@bp.route("/api/merchants", methods=["GET", "POST"])
@login_required
def api_merchants():
    if request.method == "GET":
        merchants = list_merchants_for_user(current_user.id)
        items = [m.to_dict() for m in merchants]
        return ok_response(data={"items": items}, legacy={"items": items})

    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return error_response("Name is required.", status=400, code="validation_error")
    if len(name) > 128:
        return error_response("Name too long (max 128 characters).", status=400, code="validation_error")

    existing = find_merchant_by_name(name, current_user.id)
    if existing:
        item = existing.to_dict()
        return ok_response(data={"item": item}, legacy={"item": item}, status=200)

    merchant = Merchant(name=name, user_id=current_user.id)
    try:
        db.session.add(merchant)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error_response("A merchant with this name already exists.", status=400, code="validation_error")
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception("Merchant create failed for user_id=%s", current_user.id)
        return error_response("Failed to create merchant.", status=500, code="internal_error")
    item = merchant.to_dict()
    return ok_response(data={"item": item}, legacy={"item": item}, status=201)


@bp.route("/api/merchants/<int:merchant_id>/delete", methods=["POST"])
@login_required
def api_delete_merchant(merchant_id: int):
    """Delete a user-owned merchant.

    Behaviour:
      - No dependents → hard delete, 200.
      - Dependents present, no reassign_to → 409 with counts.
      - Dependents present, reassign_to provided → remap then delete, 200.
    """
    merchant = (
        Merchant.query
        .filter(Merchant.id == merchant_id, Merchant.user_id == current_user.id)
        .first_or_404()
    )

    payload = request.get_json(silent=True) or {}
    reassign_to = payload.get("reassign_to")

    txn_count = _merchant_transaction_count(merchant_id, current_user.id)
    memorized_count = (
        MemorizedTransaction.query
        .filter(MemorizedTransaction.merchant_id == merchant_id, MemorizedTransaction.user_id == current_user.id)
        .count()
    )
    has_dependents = bool(txn_count or memorized_count)

    if has_dependents and reassign_to is None:
        return error_response(
            "This merchant has dependent rows. Provide 'reassign_to' to move them first.",
            status=409,
            code="has_dependents",
            extra={"dependent_counts": {"transactions": txn_count, "memorized": memorized_count}},
        )

    try:
        if has_dependents:
            try:
                target_id = int(reassign_to)
            except (TypeError, ValueError):
                return error_response("'reassign_to' must be a merchant id.", status=400, code="validation_error")

            if target_id == merchant_id:
                return error_response("'reassign_to' must be a different merchant.", status=400, code="validation_error")

            # Verify target belongs to this user.
            Merchant.query.filter(
                Merchant.id == target_id, Merchant.user_id == current_user.id
            ).first_or_404()

            _remap_merchant(merchant_id, target_id, current_user.id)

        db.session.delete(merchant)
        db.session.commit()
        return ok_response(data={"deleted": True}, legacy={"deleted": True})

    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception(
            "Merchant delete failed for merchant_id=%s user_id=%s", merchant_id, current_user.id
        )
        return error_response("Failed to delete merchant.", status=500, code="internal_error")


@bp.route("/api/merchants/<int:merchant_id>/update", methods=["POST"])
@login_required
def api_update_merchant(merchant_id: int):
    merchant = Merchant.query.filter_by(id=merchant_id, user_id=current_user.id).first_or_404()

    payload = request.get_json(silent=True) or {}
    new_name = (payload.get("name") or "").strip()

    if not new_name:
        return error_response("Name is required.", status=400, code="validation_error")
    if len(new_name) > 128:
        return error_response("Name too long (max 128 characters).", status=400, code="validation_error")

    existing = find_merchant_by_name(new_name, current_user.id)
    if existing and existing.id != merchant_id:
        return error_response("A merchant with this name already exists.", status=400, code="validation_error")

    try:
        merchant.name = new_name
        db.session.commit()
        item = merchant.to_dict()
        return ok_response(data={"item": item}, legacy={"item": item})
    except IntegrityError:
        db.session.rollback()
        return error_response("A merchant with this name already exists.", status=400, code="validation_error")
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception(
            "Merchant update failed for merchant_id=%s user_id=%s", merchant_id, current_user.id
        )
        return error_response("Failed to update merchant.", status=500, code="internal_error")


@bp.route("/api/merchants/<int:source_id>/remap", methods=["POST"])
@login_required
def api_remap_merchant(source_id: int):
    """Reassign all transactions and memorized rows from source to target merchant."""
    payload = request.get_json(silent=True) or {}
    try:
        target_id = int(payload.get("target_id"))
    except (TypeError, ValueError):
        return error_response("target_id is required.", status=400, code="validation_error")

    if source_id == target_id:
        return error_response("source_id and target_id must be different.", status=400, code="validation_error")

    source = (
        Merchant.query
        .filter(Merchant.id == source_id, Merchant.user_id == current_user.id)
        .first_or_404()
    )
    # Verify target belongs to this user.
    Merchant.query.filter(
        Merchant.id == target_id, Merchant.user_id == current_user.id
    ).first_or_404()

    try:
        remap_counts = _remap_merchant(source_id, target_id, current_user.id)
        db.session.delete(source)
        db.session.commit()
        return ok_response(data=remap_counts, legacy=remap_counts)
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception(
            "Merchant remap failed for source_id=%s target_id=%s user_id=%s",
            source_id, target_id, current_user.id,
        )
        return error_response("Failed to remap merchant.", status=500, code="internal_error")
