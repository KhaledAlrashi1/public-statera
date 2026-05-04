"""Memorized transactions CRUD routes."""

from __future__ import annotations
from datetime import datetime, timezone

from flask import Blueprint, request, current_app
from flask_login import login_required, current_user
from sqlalchemy.exc import IntegrityError

from backend import db
from backend.api_response import ok_response, error_response
from backend.constants import RATE_LIMIT_SEARCH
from backend.models import Category, MemorizedTransaction, Merchant
from backend.lib.categories import find_category_by_name, find_merchant_by_name
from backend.lib.suggestions import _txn_norm, prune_stale_memorized_transactions
from backend.security_ops import rate_limit

bp = Blueprint("memorized", __name__)

_SORT_OPTIONS = {
    "most_used": (
        MemorizedTransaction.is_pinned.desc(),
        MemorizedTransaction.pinned_at.desc().nullslast(),
        MemorizedTransaction.count.desc(),
        MemorizedTransaction.last_seen.desc(),
    ),
    "recently_used": (
        MemorizedTransaction.is_pinned.desc(),
        MemorizedTransaction.pinned_at.desc().nullslast(),
        MemorizedTransaction.last_seen.desc(),
    ),
    "oldest_first": (
        MemorizedTransaction.is_pinned.desc(),
        MemorizedTransaction.pinned_at.desc().nullslast(),
        MemorizedTransaction.id.asc(),
    ),
    "name_asc": (
        MemorizedTransaction.is_pinned.desc(),
        MemorizedTransaction.pinned_at.desc().nullslast(),
        MemorizedTransaction.canonical.asc(),
    ),
    "name_desc": (
        MemorizedTransaction.is_pinned.desc(),
        MemorizedTransaction.pinned_at.desc().nullslast(),
        MemorizedTransaction.canonical.desc(),
    ),
}


def _serialize_memorized_item(row: MemorizedTransaction) -> dict:
    cat = row.category_rel
    merch = row.merchant_rel
    return {
        "id": row.id,
        "canonical": row.canonical,
        "category": {"id": cat.id, "name": cat.name} if cat else None,
        "merchant": {"id": merch.id, "name": merch.name} if merch else None,
        "count": row.count,
        "last_seen": row.last_seen.isoformat() if row.last_seen else None,
        "is_pinned": bool(row.is_pinned),
        "pinned_at": row.pinned_at.isoformat() if row.pinned_at else None,
    }


@bp.route("/api/memorized-transactions", methods=["GET", "POST"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_memorized_transactions():
    if request.method == "GET":
        q = (request.args.get("q") or "").strip()
        sort_key = (request.args.get("sort") or "most_used").strip()
        if sort_key not in _SORT_OPTIONS:
            sort_key = "most_used"
        limit = min(max(1, request.args.get("limit", default=50, type=int)), 200)
        offset = max(0, request.args.get("offset", default=0, type=int))

        query = (
            MemorizedTransaction.query
            .filter(MemorizedTransaction.user_id == current_user.id)
        )

        if q:
            like_pattern = f"%{q}%"
            query = query.filter(
                MemorizedTransaction.canonical.ilike(like_pattern)
                | MemorizedTransaction.norm.ilike(like_pattern)
                | MemorizedTransaction.category_rel.has(Category.name.ilike(like_pattern))
                | MemorizedTransaction.merchant_rel.has(Merchant.name.ilike(like_pattern))
            )

        query = query.order_by(*_SORT_OPTIONS[sort_key])

        total = query.count()
        rows = query.offset(offset).limit(limit).all()

        items = [_serialize_memorized_item(row) for row in rows]
        meta_payload = {
            "total": total,
            "offset": offset,
            "limit": limit,
            "has_more": (offset + len(items)) < total,
        }
        data_payload = {"items": items}
        return ok_response(
            data=data_payload,
            meta=meta_payload,
            legacy={**data_payload, **meta_payload},
        )

    # POST: manual add
    payload = request.get_json(silent=True) or {}
    canonical = (payload.get("canonical") or "").strip()[:255]

    if not canonical:
        return error_response("Transaction name is required.", status=400, code="validation_error")

    norm = _txn_norm(canonical)
    if not norm:
        return error_response(
            "Transaction name is invalid (normalizes to empty).",
            status=400,
            code="validation_error",
        )

    # Resolve category and merchant by id (preferred) or by name fallback.
    category_id = payload.get("category_id")
    merchant_id = payload.get("merchant_id")

    if category_id is None and payload.get("category"):
        cat = find_category_by_name(payload["category"], current_user.id)
        category_id = cat.id if cat else None
    if merchant_id is None and payload.get("merchant"):
        merch = find_merchant_by_name(payload["merchant"], current_user.id)
        merchant_id = merch.id if merch else None

    now = datetime.now(timezone.utc)

    try:
        deleted = prune_stale_memorized_transactions(current_user.id, now=now)
        if deleted > 0:
            db.session.flush()

        existing = MemorizedTransaction.query.filter_by(norm=norm, user_id=current_user.id).first()

        if existing:
            existing.canonical = canonical
            if category_id is not None:
                existing.category_id = category_id
            if merchant_id is not None:
                existing.merchant_id = merchant_id
            existing.last_seen = now
            existing.count = (existing.count or 0) + 1
            db.session.commit()

            item_payload = _serialize_memorized_item(existing)
            return ok_response(data={"item": item_payload}, legacy={"item": item_payload}, status=200)
        else:
            row = MemorizedTransaction(
                canonical=canonical,
                norm=norm,
                category_id=category_id,
                merchant_id=merchant_id,
                user_id=current_user.id,
                count=1,
                last_seen=now,
            )
            db.session.add(row)
            db.session.commit()

            item_payload = _serialize_memorized_item(row)
            return ok_response(data={"item": item_payload}, legacy={"item": item_payload}, status=201)

    except IntegrityError:
        db.session.rollback()
        return error_response(
            "A memorized transaction with this name already exists.",
            status=400,
            code="validation_error",
        )
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception("Memorized create/update failed for user_id=%s", current_user.id)
        return error_response("Failed to save memorized transaction.", status=500, code="internal_error")


@bp.route("/api/memorized-transactions/<int:mem_id>/update", methods=["POST"])
@login_required
def api_memorized_transactions_update(mem_id: int):
    row = MemorizedTransaction.query.filter_by(id=mem_id, user_id=current_user.id).first()
    if row is None:
        return error_response("Memorized transaction not found.", status=404, code="not_found")

    payload = request.get_json(silent=True) or {}
    canonical = (payload.get("canonical") or "").strip()[:255]

    if not canonical:
        return error_response("Transaction name is required.", status=400, code="validation_error")

    new_norm = _txn_norm(canonical)
    if not new_norm:
        return error_response(
            "Transaction name is invalid (normalizes to empty).",
            status=400,
            code="validation_error",
        )

    if new_norm != row.norm:
        collision = MemorizedTransaction.query.filter(
            MemorizedTransaction.norm == new_norm,
            MemorizedTransaction.id != mem_id,
            MemorizedTransaction.user_id == current_user.id
        ).first()
        if collision:
            return error_response(
                "Another memorized transaction already matches this name.",
                status=400,
                code="validation_error",
            )

    # Accept category_id / merchant_id directly or resolve by name.
    category_id = payload.get("category_id")
    merchant_id = payload.get("merchant_id")
    if "category" in payload and category_id is None:
        cat_name = (payload.get("category") or "").strip()
        if cat_name:
            cat = find_category_by_name(cat_name, current_user.id)
            category_id = cat.id if cat else None
        else:
            category_id = None  # explicit clear

    if "merchant" in payload and merchant_id is None:
        merch_name = (payload.get("merchant") or "").strip()
        if merch_name:
            merch = find_merchant_by_name(merch_name, current_user.id)
            merchant_id = merch.id if merch else None
        else:
            merchant_id = None  # explicit clear

    try:
        row.canonical = canonical
        row.norm = new_norm
        if "category_id" in payload or "category" in payload:
            row.category_id = category_id
        if "merchant_id" in payload or "merchant" in payload:
            row.merchant_id = merchant_id
        row.last_seen = datetime.now(timezone.utc)

        db.session.commit()

        item_payload = _serialize_memorized_item(row)
        return ok_response(data={"item": item_payload}, legacy={"item": item_payload})
    except IntegrityError:
        db.session.rollback()
        return error_response(
            "A memorized transaction with this name already exists.",
            status=400,
            code="validation_error",
        )
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception("Memorized update failed for mem_id=%s user_id=%s", mem_id, current_user.id)
        return error_response("Failed to update memorized transaction.", status=500, code="internal_error")


@bp.route("/api/memorized-transactions/<int:mem_id>/delete", methods=["POST"])
@login_required
def api_memorized_transactions_delete(mem_id: int):
    row = MemorizedTransaction.query.filter_by(id=mem_id, user_id=current_user.id).first()
    if row is None:
        return error_response("Memorized transaction not found.", status=404, code="not_found")

    try:
        db.session.delete(row)
        db.session.commit()
        payload = {"deleted": True}
        return ok_response(data=payload, legacy=payload)
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception("Memorized delete failed for mem_id=%s user_id=%s", mem_id, current_user.id)
        return error_response("Failed to delete memorized transaction.", status=500, code="internal_error")


@bp.route("/api/memorized-transactions/<int:mem_id>/pin", methods=["POST"])
@login_required
def api_memorized_transactions_pin(mem_id: int):
    row = MemorizedTransaction.query.filter_by(id=mem_id, user_id=current_user.id).first()
    if row is None:
        return error_response("Memorized transaction not found.", status=404, code="not_found")

    payload = request.get_json(silent=True) or {}
    pinned = bool(payload.get("pinned", True))

    try:
        row.is_pinned = pinned
        row.pinned_at = datetime.now(timezone.utc) if pinned else None
        db.session.commit()
        item_payload = _serialize_memorized_item(row)
        return ok_response(data={"item": item_payload}, legacy={"item": item_payload})
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception("Memorized pin failed for mem_id=%s user_id=%s", mem_id, current_user.id)
        return error_response("Failed to update pin state.", status=500, code="internal_error")


@bp.route("/api/memorized-transactions/bulk-delete", methods=["POST"])
@login_required
def api_memorized_transactions_bulk_delete():
    payload = request.get_json(silent=True) or {}
    ids = payload.get("ids")
    if not isinstance(ids, list) or not ids:
        return error_response("ids must be a non-empty list.", status=400, code="validation_error")
    if len(ids) > 200:
        return error_response("Cannot delete more than 200 entries at once.", status=400, code="validation_error")
    if not all(isinstance(i, int) and i > 0 for i in ids):
        return error_response("All ids must be positive integers.", status=400, code="validation_error")

    try:
        deleted = (
            MemorizedTransaction.query
            .filter(
                MemorizedTransaction.id.in_(ids),
                MemorizedTransaction.user_id == current_user.id,
            )
            .delete(synchronize_session=False)
        )
        db.session.commit()
        resp_payload = {"deleted": deleted}
        return ok_response(data=resp_payload, legacy=resp_payload)
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception("Memorized bulk-delete failed for user_id=%s", current_user.id)
        return error_response("Failed to delete memorized transactions.", status=500, code="internal_error")
