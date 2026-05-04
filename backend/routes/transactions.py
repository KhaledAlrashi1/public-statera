"""Transaction CRUD, search, and duplicate check routes."""

from __future__ import annotations
import csv
import io
import tempfile
from datetime import date as date_cls, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from flask import Blueprint, request, jsonify, current_app, Response, stream_with_context
from flask_login import login_required, current_user
from openpyxl import Workbook
from sqlalchemy import case, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload, sessionmaker
from sqlalchemy.sql import func

from backend import db
from backend.api_response import ok_response, error_response
from backend.constants import (
    UNCAT_NAME,
    RATE_LIMIT_SEARCH,
    RATE_LIMIT_IMPORT,
    RATE_LIMIT_EXPORT,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    EXPORT_CSV_MAX_ROWS,
)
from backend.db_compat import month_bucket
from backend.models import (
    BankConnection,
    BankConsent,
    Category,
    DataAccessLog,
    Merchant,
    RawBankTransaction,
    Transaction,
)
from backend.lib.cache import cache_bust_dashboard_metrics
from backend.lib.cache import cache_bust_safe_to_spend
from backend.lib.categories import (
    find_category_ids_by_name,
    find_merchant_ids_by_name,
    get_or_create_category,
    get_or_create_merchant,
)
from backend.lib.importer import _parse_amount, _parse_date
from backend.lib.payday import expense_category_filter_expr, income_category_filter_expr
from backend.lib.suggestions import learn_transaction
from backend.lib.transactions import (
    build_name_key,
    create_transaction_with_dup_check,
    force_unique_name_key,
    validate_transaction_input,
)
from backend.lib.validation import ValidationError, validate_split_direction_consistency
from backend.security_ops import rate_limit
from backend.routes.auth import _audit_security_event
from backend.money_math import format_kd

bp = Blueprint("transactions", __name__)
EXPORT_HEADERS = [
    "transaction_id",
    "date",
    "merchant",
    "category",
    "name",
    "amount_kd",
    "memo",
]


def _sanitize_spreadsheet_cell(value: str | None) -> str:
    text = "" if value is None else str(value)
    trimmed = text.lstrip()
    if trimmed.startswith(("=", "+", "-", "@")):
        return f"'{text}"
    return text


def _format_amount_validation_error(message: str, *, prefix: str) -> str:
    if "more than 3 decimal places" in message.lower():
        return f"{prefix} cannot have more than 3 decimal places."
    return f"{prefix} has invalid amount."


def _like_pattern(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _arg_bool(name: str, default: bool = False) -> bool:
    raw = request.args.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")



def _parse_split_rows(raw_rows) -> list[dict]:
    if not isinstance(raw_rows, list):
        raise ValidationError("rows must be an array.")

    split_rows: list[dict] = []
    for index, raw in enumerate(raw_rows):
        if not isinstance(raw, dict):
            raise ValidationError(f"Split row {index + 1} is invalid.")

        name = str(raw.get("name") or "").strip()
        category = str(raw.get("category") or "").strip()
        amount_raw = str(raw.get("amount_kd") or "").strip()

        if not name:
            raise ValidationError(f"Split row {index + 1} name is required.")
        if not category:
            raise ValidationError(f"Split row {index + 1} category is required.")

        try:
            amount = _parse_amount(amount_raw)
        except Exception as exc:  # noqa: BLE001 - transaction routes should rollback or skip non-critical work instead of corrupting the request flow.
            raise ValidationError(
                _format_amount_validation_error(
                    str(exc),
                    prefix=f"Split row {index + 1} amount",
                )
            ) from exc
        if amount <= 0:
            raise ValidationError(f"Split row {index + 1} amount must be greater than zero.")

        split_rows.append({
            "name": name,
            "category": category,
            "amount": amount,
        })

    if len(split_rows) < 2:
        raise ValidationError("Provide at least two split rows.")

    return split_rows


def _empty_search_response(*, offset: int, limit: int):
    empty = {"items": []}
    pagination = {"total": 0, "offset": offset, "limit": limit, "has_more": False}
    return ok_response(data=empty, meta=pagination, legacy={**empty, **pagination})


def _search_response(items: list[dict], *, total: int, offset: int, limit: int, has_more: bool):
    data_payload = {"items": items}
    meta_payload = {
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": has_more,
    }
    return ok_response(
        data=data_payload,
        meta=meta_payload,
        legacy={
            "items": items,
            "total": total,
            "offset": offset,
            "limit": limit,
            "has_more": has_more,
        },
    )


def _by_category_response(
    *,
    category: str,
    month: str | None,
    items: list[dict],
    total: int,
    offset: int,
    limit: int,
    has_more: bool,
):
    data_payload = {
        "category": category,
        "month": month,
        "items": items,
    }
    meta_payload = {
        "has_more": has_more,
        "total": total,
        "offset": offset,
        "limit": limit,
    }
    return ok_response(
        data=data_payload,
        meta=meta_payload,
        legacy={**data_payload, **meta_payload},
    )


def _empty_by_category_response(*, category: str, month: str | None, offset: int, limit: int):
    return _by_category_response(
        category=category,
        month=month,
        items=[],
        total=0,
        offset=offset,
        limit=limit,
        has_more=False,
    )


def _normalize_source(source: str | None) -> str:
    normalized = (source or "").strip().lower()
    return normalized or "manual"


def _source_label(source: str | None, institution_name: str | None = None) -> str:
    normalized = _normalize_source(source)
    if normalized == "bank_import":
        return (institution_name or "Bank").strip() or "Bank"
    if normalized == "csv_import":
        return "CSV"
    return "Manual"


def _bank_institution_map_for_transactions(transaction_ids: list[int]) -> dict[int, str]:
    if not transaction_ids:
        return {}
    rows = (
        db.session.query(
            RawBankTransaction.transaction_id,
            BankConnection.institution_name,
        )
        .join(BankConnection, RawBankTransaction.connection_id == BankConnection.id)
        .filter(RawBankTransaction.user_id == current_user.id)
        .filter(RawBankTransaction.transaction_id.in_(transaction_ids))
        .order_by(RawBankTransaction.id.desc())
        .all()
    )
    out: dict[int, str] = {}
    for txn_id, institution_name in rows:
        if txn_id is None:
            continue
        key = int(txn_id)
        if key in out:
            continue
        out[key] = (institution_name or "").strip()
    return out


def _parse_date_bound(raw_value: str, *, field_name: str):
    if not raw_value:
        return None
    try:
        return _parse_date(raw_value)
    except Exception:  # noqa: BLE001 - transaction routes should rollback or skip non-critical work instead of corrupting the request flow.
        raise ValidationError(f"{field_name} must be in YYYY-MM-DD format.")


def _validate_page_args(limit: int | None, offset: int | None):
    if limit is None:
        limit = DEFAULT_PAGE_SIZE
    if limit < 1 or limit > MAX_PAGE_SIZE:
        raise ValidationError(f"limit must be between 1 and {MAX_PAGE_SIZE}.")

    if offset is None:
        offset = 0
    if offset < 0:
        raise ValidationError("offset must be >= 0.")
    return limit, offset


def _paginate_query(query, *, offset: int, limit: int, include_total: bool):
    if include_total:
        total = query.count()
        rows = query.offset(offset).limit(limit).all()
        has_more = (offset + len(rows) < total)
    else:
        rows = query.offset(offset).limit(limit + 1).all()
        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]
        total = -1
    return rows, total, has_more


def _resolve_filter_ids_or_empty(
    filter_value: str,
    *,
    finder,
    user_id: int,
    offset: int,
    limit: int,
):
    if not filter_value:
        return None, None
    ids = finder(filter_value, user_id)
    if not ids:
        return None, _empty_search_response(offset=offset, limit=limit)
    return ids, None


def _apply_time_and_income_filters(query, *, date_from, date_to, income_only: bool, exclude_income: bool):
    if date_from:
        query = query.filter(Transaction.date >= date_from)
    if date_to:
        query = query.filter(Transaction.date <= date_to)
    income_filter = income_category_filter_expr(Category.name, Category.is_income)
    expense_filter = expense_category_filter_expr(Category.name, Category.is_income)
    if income_only:
        query = query.filter(income_filter)
    elif exclude_income:
        query = query.filter(expense_filter)
    return query


@bp.route("/api/transactions/<int:txn_id>/update", methods=["POST"])
@login_required
def api_update_transaction(txn_id: int):
    txn = Transaction.query.filter_by(id=txn_id, user_id=current_user.id).first_or_404()
    payload = request.get_json(silent=True) or {}

    try:
        d = _parse_date(payload.get("date"))
        if not d:
            raise ValueError("Date is required.")

        merchant_name = (payload.get("merchant") or "").strip()
        memo = (payload.get("memo") or "").strip()[:255]
        cat_name = (payload.get("category") or "").strip()
        nm = (payload.get("name") or "").strip()

        summary_fields_provided = any(
            payload.get(k) is not None for k in ("category", "name", "amount_kd")
        )
        if summary_fields_provided:
            if not nm:
                raise ValueError("Name is required.")
            amt = _parse_amount(payload.get("amount_kd"))
        else:
            cat_name = txn.category_rel.name if txn.category_rel else ""
            nm = txn.name
            amt = txn.amount_kd

        cat = get_or_create_category(cat_name, current_user.id)
        merchant = get_or_create_merchant(merchant_name, current_user.id) if merchant_name else None

        txn.date = d
        txn.category_id = cat.id if cat else None
        txn.merchant_id = merchant.id if merchant else None
        txn.name = nm
        txn.name_key = build_name_key(nm)
        txn.amount_kd = amt
        txn.memo = memo if memo else None

        learn_transaction(txn.name, current_user.id, category_id=cat.id if cat else None, merchant_id=merchant.id if merchant else None)
        db.session.commit()
        cache_bust_dashboard_metrics(current_user.id)
        cache_bust_safe_to_spend(current_user.id)

        return jsonify({
            "ok": True,
            "item": txn.to_dict()
        })
    except (ValueError, ValidationError) as e:
        db.session.rollback()
        return error_response(str(e), status=400, code="validation_error")
    except IntegrityError:
        db.session.rollback()
        return error_response(
            "This would duplicate an existing transaction.",
            status=400,
            code="transaction_duplicate_conflict",
        )
    except Exception:  # noqa: BLE001 - transaction routes should rollback or skip non-critical work instead of corrupting the request flow.
        db.session.rollback()
        current_app.logger.exception("Transaction update failed (txn_id=%s)", txn_id)
        return error_response(
            "Failed to update transaction.",
            status=500,
            code="transaction_update_failed",
        )


@bp.route("/api/transactions/<int:txn_id>/split", methods=["POST"])
@login_required
def api_split_transaction(txn_id: int):
    txn = (
        Transaction.query
        .options(
            joinedload(Transaction.category_rel),
            joinedload(Transaction.merchant_rel),
        )
        .filter_by(id=txn_id, user_id=current_user.id)
        .first_or_404()
    )
    payload = request.get_json(silent=True) or {}

    try:
        split_rows = _parse_split_rows(payload.get("rows"))
        validate_split_direction_consistency(
            parent_category_name=txn.category_rel.name if txn.category_rel else None,
            item_category_names=[row["category"] for row in split_rows],
            user_id=current_user.id,
        )
        # Splits are persisted as atomic sibling transactions. The legacy
        # `items` table has been removed, so request-time validation keeps the
        # rewritten rows balanced before the original transaction is replaced.
        original_total = Decimal(str(txn.amount_kd or "0"))
        split_total = sum((row["amount"] for row in split_rows), Decimal("0"))
        if split_total != original_total:
            raise ValidationError("Split amounts must sum to the original transaction total.")

        inherited_date = txn.date
        inherited_merchant_id = txn.merchant_id
        inherited_memo = txn.memo
        inherited_source = _normalize_source(getattr(txn, "source", None))
        merchant_name = txn.merchant_rel.name if txn.merchant_rel else None

        first_row = split_rows[0]
        first_category = get_or_create_category(first_row["category"], current_user.id)
        txn.category_id = first_category.id
        txn.name = first_row["name"]
        txn.amount_kd = first_row["amount"]
        txn.memo = inherited_memo
        txn.merchant_id = inherited_merchant_id
        txn.name_key = force_unique_name_key(
            inherited_date,
            first_row["name"],
            first_row["amount"],
            current_user.id,
            exclude_transaction_id=txn.id,
        )
        db.session.flush()
        learn_transaction(txn.name, current_user.id, category_id=first_category.id, merchant_id=inherited_merchant_id)

        split_transactions = [txn]
        for row in split_rows[1:]:
            category = get_or_create_category(row["category"], current_user.id)
            child = Transaction(
                user_id=current_user.id,
                date=inherited_date,
                source=inherited_source,
                merchant_id=inherited_merchant_id,
                category_id=category.id,
                name=row["name"],
                memo=inherited_memo,
                name_key=force_unique_name_key(
                    inherited_date,
                    row["name"],
                    row["amount"],
                    current_user.id,
                ),
                amount_kd=row["amount"],
            )
            db.session.add(child)
            db.session.flush()
            learn_transaction(child.name, current_user.id, category_id=category.id, merchant_id=inherited_merchant_id)
            split_transactions.append(child)

        db.session.commit()
        cache_bust_dashboard_metrics(current_user.id)
        cache_bust_safe_to_spend(current_user.id)

        return jsonify({
            "ok": True,
            "transactions": [
                {
                    "id": split_txn.id,
                    "date": split_txn.date.isoformat(),
                    "merchant": split_txn.merchant_rel.name if split_txn.merchant_rel else None,
                    "category": split_txn.category_rel.name if split_txn.category_rel else UNCAT_NAME,
                    "name": split_txn.name,
                    "memo": split_txn.memo,
                    "amount_kd": format_kd(split_txn.amount_kd),
                    "source": _normalize_source(getattr(split_txn, "source", None)),
                }
                for split_txn in split_transactions
            ],
        })
    except ValidationError as err:
        db.session.rollback()
        return error_response(str(err), status=400, code=err.error_code)
    except IntegrityError:
        db.session.rollback()
        return error_response(
            "A split row would duplicate an existing transaction.",
            status=400,
            code="transaction_split_duplicate_conflict",
        )
    except Exception:  # noqa: BLE001 - transaction routes should rollback or skip non-critical work instead of corrupting the request flow.
        db.session.rollback()
        current_app.logger.exception("Transaction split failed (txn_id=%s)", txn_id)
        return error_response(
            "Failed to split transaction.",
            status=500,
            code="transaction_split_failed",
        )


@bp.route("/api/transactions/summary")
@login_required
def api_transactions_summary():
    month = (request.args.get("month") or "").strip()
    if not month:
        now = datetime.now(timezone.utc)
        month = f"{now.year}-{now.month:02d}"

    if len(month) != 7 or month[4] != "-" or not month[:4].isdigit() or not month[5:].isdigit():
        return error_response("month must be in YYYY-MM format", status=400, code="validation_error")

    ym = month_bucket(Transaction.date)
    base_query = (
        Transaction.query
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == current_user.id)
        .filter(ym == month)
    )

    income_filter = income_category_filter_expr(Category.name, Category.is_income)
    expense_filter = expense_category_filter_expr(Category.name, Category.is_income)
    income_count = base_query.filter(income_filter).count()
    transaction_count = base_query.filter(expense_filter).count()

    return jsonify({
        "ok": True,
        "month": month,
        "transaction_count": transaction_count,
        "income_count": income_count,
    })


@bp.route("/api/transactions/top-patterns")
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_transactions_top_patterns():
    range_key = (request.args.get("range") or "30").strip()
    if range_key not in {"30", "90", "365", "all"}:
        return error_response(
            "range must be one of: 30, 90, 365, all",
            status=400,
            code="validation_error",
        )

    name_key_expr = func.lower(func.trim(Transaction.name))
    query = (
        db.session.query(
            name_key_expr.label("name_key"),
            func.min(Transaction.name).label("name"),
            func.count(Transaction.id).label("count"),
            func.sum(Transaction.amount_kd).label("sum_kd"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == current_user.id)
        .filter(expense_category_filter_expr(Category.name, Category.is_income))
        .filter(func.length(func.trim(Transaction.name)) > 0)
    )

    if range_key != "all":
        cutoff = datetime.now(timezone.utc).date() - timedelta(days=int(range_key))
        query = query.filter(Transaction.date >= cutoff)

    rows = (
        query.group_by(name_key_expr)
        .order_by(
            func.count(Transaction.id).desc(),
            func.sum(Transaction.amount_kd).desc(),
            func.min(Transaction.name).asc(),
        )
        .limit(3)
        .all()
    )

    return jsonify({
        "ok": True,
        "range": range_key,
        "items": [
            {
                "name": name or "",
                "count": int(count or 0),
                "sum_kd": format_kd(sum_kd or 0),
            }
            for _name_key, name, count, sum_kd in rows
        ],
    })


@bp.route("/api/transactions/search")
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_transactions_search():
    q = (request.args.get("q") or "").strip()
    cat = (request.args.get("category") or "").strip()
    merchant = (request.args.get("merchant") or "").strip()
    date_from_raw = (request.args.get("date_from") or "").strip()
    date_to_raw = (request.args.get("date_to") or "").strip()
    income_only = _arg_bool("income_only")
    exclude_income = _arg_bool("exclude_income")
    limit = request.args.get("limit", type=int)
    offset = request.args.get("offset", type=int)
    include_total = _arg_bool("include_total", default=True)
    source = (request.args.get("source") or "").strip().lower()
    connection_id = request.args.get("connection_id", type=int)
    consent_id = request.args.get("consent_id", type=int)

    try:
        if income_only and exclude_income:
            raise ValidationError("income_only and exclude_income cannot both be true.")
        date_from = _parse_date_bound(date_from_raw, field_name="date_from")
        date_to = _parse_date_bound(date_to_raw, field_name="date_to")
        limit, offset = _validate_page_args(limit, offset)
    except ValidationError as err:
        return error_response(str(err), status=400, code="validation_error")

    if date_from and date_to and date_from > date_to:
        return error_response(
            "date_from must be on or before date_to",
            status=400,
            code="invalid_date_range",
        )

    query = (
        db.session.query(Transaction, Category.name, Merchant.name)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .outerjoin(Merchant, Transaction.merchant_id == Merchant.id)
        .filter(Transaction.user_id == current_user.id)
    )

    if q:
        like = _like_pattern(q)
        query = query.filter(or_(
            Transaction.name.ilike(like, escape="\\"),
            Category.name.ilike(like, escape="\\"),
            Merchant.name.ilike(like, escape="\\")
        ))

    if cat:
        cat_ids, empty_resp = _resolve_filter_ids_or_empty(
            cat,
            finder=find_category_ids_by_name,
            user_id=current_user.id,
            offset=offset,
            limit=limit,
        )
        if empty_resp:
            return empty_resp
        query = query.filter(Transaction.category_id.in_(cat_ids))

    if merchant:
        merchant_ids, empty_resp = _resolve_filter_ids_or_empty(
            merchant,
            finder=find_merchant_ids_by_name,
            user_id=current_user.id,
            offset=offset,
            limit=limit,
        )
        if empty_resp:
            return empty_resp
        query = query.filter(Transaction.merchant_id.in_(merchant_ids))

    query = _apply_time_and_income_filters(
        query,
        date_from=date_from,
        date_to=date_to,
        income_only=income_only,
        exclude_income=exclude_income,
    )
    query = query.order_by(Transaction.date.desc(), Transaction.id.desc())
    rows, total, has_more = _paginate_query(
        query, offset=offset, limit=limit, include_total=include_total
    )
    bank_institution_by_txn = _bank_institution_map_for_transactions(
        [int(t.id) for t, _cat_name, _merchant_name in rows if t and t.id]
    )

    items = []
    for t, cat_name, merchant_name in rows:
        normalized_source = _normalize_source(getattr(t, "source", None))
        source_label = _source_label(
            normalized_source,
            bank_institution_by_txn.get(int(t.id)) if t and t.id else None,
        )
        items.append({
            "id": t.id,
            "date": t.date.isoformat(),
            "merchant": merchant_name,
            "category": cat_name or UNCAT_NAME,
            "name": t.name,
            "memo": t.memo,
            "amount_kd": format_kd(t.amount_kd),
            "source": normalized_source,
            "source_label": source_label,
            "transaction_id": t.id,
        })

    if source == "bank_sync":
        resolved_connection_id = None
        if connection_id is not None:
            owns_connection = (
                BankConnection.query
                .with_entities(BankConnection.id)
                .filter(BankConnection.id == connection_id, BankConnection.user_id == current_user.id)
                .first()
            )
            if owns_connection:
                resolved_connection_id = int(connection_id)

        resolved_consent_id = None
        if consent_id is not None:
            consent_row = (
                BankConsent.query
                .with_entities(BankConsent.id)
                .filter(BankConsent.id == consent_id, BankConsent.user_id == current_user.id)
                .first()
            )
            if consent_row:
                resolved_consent_id = int(consent_id)

        item_dates = [item.get("date") for item in items if isinstance(item.get("date"), str)]
        parsed_dates: list[date_cls] = []
        for raw in item_dates:
            try:
                parsed_dates.append(date_cls.fromisoformat(raw))
            except Exception:  # noqa: BLE001 - transaction routes should rollback or skip non-critical work instead of corrupting the request flow.
                continue
        date_range_start = min(parsed_dates) if parsed_dates else None
        date_range_end = max(parsed_dates) if parsed_dates else None

        try:
            db.session.add(
                DataAccessLog(
                    user_id=current_user.id,
                    connection_id=resolved_connection_id,
                    consent_id=resolved_consent_id,
                    action="transactions.search",
                    records_accessed=len(items),
                    date_range_start=date_range_start,
                    date_range_end=date_range_end,
                    ip_address=(request.remote_addr or "unknown"),
                )
            )
            db.session.commit()
        except Exception:  # noqa: BLE001 - transaction routes should rollback or skip non-critical work instead of corrupting the request flow.
            db.session.rollback()
            current_app.logger.exception(
                "Failed to write transactions data access log user_id=%s",
                current_user.id,
            )

    return _search_response(items, total=total, offset=offset, limit=limit, has_more=has_more)


@bp.route("/api/transactions/by-category")
@login_required
def api_transactions_by_category():
    category = (request.args.get("category") or "").strip()
    if not category:
        return error_response("category is required", status=400, code="validation_error")

    raw_limit = request.args.get("limit", type=int)
    raw_offset = request.args.get("offset", type=int)
    try:
        limit, offset = _validate_page_args(raw_limit, raw_offset)
    except ValidationError as err:
        return error_response(str(err), status=400, code="validation_error")
    q = (request.args.get("q") or "").strip()
    month = (request.args.get("month") or "").strip()
    include_total = _arg_bool("include_total", default=True)
    month_value = month or None

    cat_ids = find_category_ids_by_name(category, current_user.id)
    if not cat_ids:
        return _empty_by_category_response(
            category=category,
            month=month_value,
            offset=offset,
            limit=limit,
        )

    query = (
        db.session.query(Transaction, Category.name, Merchant.name)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .outerjoin(Merchant, Transaction.merchant_id == Merchant.id)
        .filter(Transaction.category_id.in_(cat_ids))
        .filter(Transaction.user_id == current_user.id)
    )

    if month:
        ym = month_bucket(Transaction.date)
        query = query.filter(ym == month)

    if q:
        like = _like_pattern(q)
        query = query.filter(or_(
            Transaction.name.ilike(like, escape="\\"),
        ))

    query = query.order_by(Transaction.date.desc(), Transaction.id.desc())
    rows, total, has_more = _paginate_query(
        query, offset=offset, limit=limit, include_total=include_total
    )
    bank_institution_by_txn = _bank_institution_map_for_transactions(
        [int(t.id) for t, _cat_name, _merchant_name in rows if t and t.id]
    )

    items = []
    for t, cat_name, merchant_name in rows:
        normalized_source = _normalize_source(getattr(t, "source", None))
        source_label = _source_label(
            normalized_source,
            bank_institution_by_txn.get(int(t.id)) if t and t.id else None,
        )
        items.append({
            "id": t.id,
            "transaction_id": t.id,
            "date": t.date.isoformat(),
            "merchant": merchant_name,
            "category": cat_name or UNCAT_NAME,
            "name": t.name,
            "memo": t.memo,
            "amount_kd": format_kd(t.amount_kd),
            "source": normalized_source,
            "source_label": source_label,
        })

    return _by_category_response(
        category=category,
        month=month_value,
        items=items,
        total=total,
        offset=offset,
        limit=limit,
        has_more=has_more,
    )


@bp.route("/api/transactions/dup-check")
@login_required
def api_txn_dup_check():
    d = request.args.get("date", type=str)
    n = (request.args.get("name") or "").strip()
    a = request.args.get("amount_kd", type=str)

    if not d or not n or not a:
        return error_response(
            "date, name, amount_kd are required",
            status=400,
            code="validation_error",
        )

    try:
        amt = _parse_amount(a)
        key = build_name_key(n)
        count = (
            Transaction.query
            .filter(Transaction.user_id == current_user.id)
            .filter(Transaction.date == _parse_date(d))
            .filter(Transaction.name_key == key)
            .filter(Transaction.amount_kd == amt)
            .count()
        )
        return jsonify({"ok": True, "count": count})
    except Exception:  # noqa: BLE001 - transaction routes should rollback or skip non-critical work instead of corrupting the request flow.
        current_app.logger.exception("Transaction dup-check failed")
        return error_response(
            "Invalid duplicate-check payload.",
            status=400,
            code="validation_error",
        )


@bp.route("/api/transactions/create", methods=["POST"])
@rate_limit(RATE_LIMIT_IMPORT)
@login_required
def api_transactions_create():
    payload = request.get_json(silent=True) or request.form

    try:
        validated = validate_transaction_input(payload)
        raw_force = payload.get("force")
        force = raw_force is True or str(raw_force or "0") == "1"

        txn_name = validated['name']
        txn_category = validated['category_name']
        txn_amount = validated['amount']

        txn, is_dup, error_msg = create_transaction_with_dup_check(
            validated['date'],
            txn_category,
            txn_name,
            txn_amount,
            current_user.id,
            force,
            validated.get('merchant_name'),
            source="manual",
        )

        if error_msg:
            if is_dup:
                return error_response(
                    error_msg,
                    status=409,
                    code="transaction_duplicate_conflict",
                    extra={"duplicate": True},
                )
            else:
                return error_response(error_msg, status=400, code="validation_error")

        try:
            db.session.commit()
            cache_bust_dashboard_metrics(current_user.id)
            cache_bust_safe_to_spend(current_user.id)
            return jsonify({
                "ok": True,
                "item": {
                    **txn.to_dict(),
                    "source": _normalize_source(getattr(txn, "source", None)),
                    "source_label": "Manual",
                }
            }), 201

        except IntegrityError:
            db.session.rollback()

            if not force:
                # Race condition: a concurrent request committed an identical transaction
                # between our duplicate check and our commit. The user did not explicitly
                # request a forced insert, so surface this as a duplicate rather than
                # silently creating a second transaction with a mangled name_key.
                return error_response(
                    "This transaction already exists. Confirm to add anyway.",
                    status=409,
                    code="transaction_duplicate_conflict",
                    extra={"duplicate": True},
                )

            # The user explicitly opted in to override the duplicate (force=True).
            # The IntegrityError means force_unique_name_key collided under concurrent
            # load. Retry once with a fresh unique key.
            txn2, _, error_msg2 = create_transaction_with_dup_check(
                validated['date'],
                txn_category,
                txn_name,
                txn_amount,
                current_user.id,
                force=True,
                merchant_name=validated.get('merchant_name'),
                source="manual",
            )

            if error_msg2:
                return error_response(
                    f"Retry failed: {error_msg2}",
                    status=500,
                    code="transaction_create_retry_failed",
                )

            db.session.commit()
            cache_bust_dashboard_metrics(current_user.id)
            cache_bust_safe_to_spend(current_user.id)
            return jsonify({
                "ok": True,
                "item": {
                    **txn2.to_dict(),
                    "source": _normalize_source(getattr(txn2, "source", None)),
                    "source_label": "Manual",
                }
            }), 201

    except ValidationError as e:
        return error_response(str(e), status=400, code="validation_error")
    except Exception:  # noqa: BLE001 - transaction routes should rollback or skip non-critical work instead of corrupting the request flow.
        db.session.rollback()
        current_app.logger.exception("Transaction create failed")
        return error_response(
            "Failed to create transaction.",
            status=500,
            code="transaction_create_failed",
        )


@bp.route("/api/transactions/<int:txn_id>", methods=["GET"])
@login_required
def api_get_transaction_detail(txn_id: int):
    txn = Transaction.query.filter_by(id=txn_id, user_id=current_user.id).first_or_404()
    return jsonify({
        "ok": True,
        "transaction": txn.to_dict()
    })


@bp.route("/api/transactions/<int:txn_id>/delete", methods=["POST"])
@login_required
def api_delete_transaction(txn_id: int):
    txn = Transaction.query.filter_by(id=txn_id, user_id=current_user.id).first_or_404()
    db.session.delete(txn)
    db.session.commit()
    cache_bust_dashboard_metrics(current_user.id)
    cache_bust_safe_to_spend(current_user.id)
    return jsonify({"ok": True})


@bp.route("/api/transactions/bulk-delete", methods=["POST"])
@login_required
def api_bulk_delete_transactions():
    payload = request.get_json(silent=True) or {}
    ids = payload.get("ids", [])
    if not isinstance(ids, list) or not ids:
        return error_response("ids must be a non-empty list", status=400, code="validation_error")
    if len(ids) > 200:
        return error_response("Cannot delete more than 200 transactions at once", status=400, code="validation_error")

    deleted = 0
    for txn_id in ids:
        txn = Transaction.query.filter_by(id=txn_id, user_id=current_user.id).first()
        if txn:
            db.session.delete(txn)
            deleted += 1
    db.session.commit()
    if deleted:
        cache_bust_dashboard_metrics(current_user.id)
        cache_bust_safe_to_spend(current_user.id)
    return ok_response({"deleted": deleted})


@bp.route("/api/transactions/import-batch/<batch_id>", methods=["DELETE"])
@login_required
def api_delete_import_batch(batch_id: str):
    try:
        normalized_batch_id = str(UUID(str(batch_id).strip()))
    except (TypeError, ValueError):
        return error_response(
            "Import batch not found.",
            status=404,
            code="import_batch_not_found",
        )

    deleted = (
        Transaction.query
        .filter(Transaction.user_id == current_user.id)
        .filter(Transaction.import_batch_id == normalized_batch_id)
        .delete(synchronize_session=False)
    )
    db.session.commit()

    if deleted <= 0:
        return error_response(
            "Import batch not found.",
            status=404,
            code="import_batch_not_found",
        )

    cache_bust_dashboard_metrics(current_user.id)
    cache_bust_safe_to_spend(current_user.id)
    return ok_response(
        {"deleted_count": deleted},
        legacy={"deleted_count": deleted},
    )


@bp.route("/api/transactions/bulk-update", methods=["POST"])
@login_required
def api_bulk_update_transactions():
    payload = request.get_json(silent=True) or {}
    ids = payload.get("ids", [])
    changes = payload.get("changes", {})
    if not isinstance(ids, list) or not ids:
        return error_response("ids must be a non-empty list", status=400, code="validation_error")
    if len(ids) > 200:
        return error_response("Cannot update more than 200 transactions at once", status=400, code="validation_error")
    if not isinstance(changes, dict) or not changes:
        return error_response("changes must be a non-empty object", status=400, code="validation_error")

    allowed_fields = {"merchant", "category", "name"}
    unknown = set(changes.keys()) - allowed_fields
    if unknown:
        return error_response(f"Unknown fields: {unknown}", status=400, code="validation_error")

    new_category = None
    if "category" in changes:
        cat_name = (changes["category"] or "").strip()
        if not cat_name:
            return error_response("category cannot be empty", status=400, code="validation_error")
        new_category = get_or_create_category(cat_name, current_user.id)

    new_merchant = None
    merchant_clear = False
    if "merchant" in changes:
        merchant_name = (changes["merchant"] or "").strip()
        if merchant_name:
            new_merchant = get_or_create_merchant(merchant_name, current_user.id)
        else:
            merchant_clear = True

    txns = (
        Transaction.query
        .filter(Transaction.user_id == current_user.id)
        .filter(Transaction.id.in_(ids))
        .all()
    )

    updated_txn_ids: list[int] = []
    for txn in txns:
        if new_category:
            txn.category_id = new_category.id
        if new_merchant:
            txn.merchant_id = new_merchant.id
        elif merchant_clear:
            txn.merchant_id = None
        if "name" in changes:
            nm = (changes["name"] or "").strip()
            if nm:
                txn.name = nm
        updated_txn_ids.append(int(txn.id))

    updated = len(updated_txn_ids)
    db.session.commit()
    if updated:
        cache_bust_dashboard_metrics(current_user.id)
        cache_bust_safe_to_spend(current_user.id)
    return ok_response({"updated": updated})


@bp.route("/api/transactions/export-csv", methods=["GET"])
@rate_limit(RATE_LIMIT_EXPORT)
@login_required
def export_csv():
    """Export all of the current user's transactions as a downloadable CSV file."""
    SessionLocal = sessionmaker(bind=db.engine)
    total_rows = _count_export_rows(SessionLocal, current_user.id)
    truncated = total_rows >= EXPORT_CSV_MAX_ROWS

    def generate_csv():
        buf = io.StringIO()
        writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(EXPORT_HEADERS)
        yield "\ufeff" + buf.getvalue()
        buf.seek(0)
        buf.truncate(0)

        rows_in_buffer = 0
        for row in _iter_export_rows(SessionLocal, current_user.id, max_rows=EXPORT_CSV_MAX_ROWS):
            writer.writerow(row)
            rows_in_buffer += 1
            if rows_in_buffer >= 200:
                yield buf.getvalue()
                buf.seek(0)
                buf.truncate(0)
                rows_in_buffer = 0

        if rows_in_buffer:
            yield buf.getvalue()

    today_str = date_cls.today().isoformat()
    export_headers = _export_headers(
        filename=f'my-finance-data-{today_str}.csv',
        truncated=truncated,
    )
    _record_export_audit(
        action="transactions.export.csv",
        user_id=current_user.id,
        total_rows=total_rows,
        truncated=truncated,
    )

    return Response(
        stream_with_context(generate_csv()),
        mimetype="text/csv",
        headers=export_headers,
    )


@bp.route("/api/transactions/export-xlsx", methods=["GET"])
@rate_limit(RATE_LIMIT_EXPORT)
@login_required
def export_xlsx():
    SessionLocal = sessionmaker(bind=db.engine)
    total_rows = _count_export_rows(SessionLocal, current_user.id)
    truncated = total_rows >= EXPORT_CSV_MAX_ROWS

    def generate_xlsx():
        workbook = Workbook(write_only=True)
        worksheet = workbook.create_sheet(title="Transactions")
        worksheet.append(EXPORT_HEADERS)
        for row in _iter_export_rows(SessionLocal, current_user.id, max_rows=EXPORT_CSV_MAX_ROWS):
            worksheet.append(row)

        temp_file = tempfile.SpooledTemporaryFile(max_size=1024 * 1024, mode="w+b")
        try:
            workbook.save(temp_file)
            temp_file.seek(0)
            while True:
                chunk = temp_file.read(64 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            try:
                workbook.close()
            except Exception:  # noqa: BLE001 - transaction routes should rollback or skip non-critical work instead of corrupting the request flow.
                pass
            temp_file.close()

    today_str = date_cls.today().isoformat()
    export_headers = _export_headers(
        filename=f'my-finance-data-{today_str}.xlsx',
        truncated=truncated,
    )
    _record_export_audit(
        action="transactions.export.xlsx",
        user_id=current_user.id,
        total_rows=total_rows,
        truncated=truncated,
    )

    return Response(
        stream_with_context(generate_xlsx()),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=export_headers,
    )


def _count_export_rows(SessionLocal, user_id: int) -> int:
    count_session = SessionLocal()
    try:
        total_rows = (
            count_session.query(
                func.count(Transaction.id)
            )
            .filter(Transaction.user_id == user_id)
            .scalar()
            or 0
        )
        return int(total_rows)
    finally:
        count_session.close()


def _export_headers(*, filename: str, truncated: bool) -> dict[str, str]:
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-cache, no-store",
        "X-Export-Truncated": "true" if truncated else "false",
        "X-Export-Row-Limit": str(EXPORT_CSV_MAX_ROWS),
    }
    if truncated:
        headers["X-Export-Error-Code"] = "export_limit_exceeded"
    return headers


def _record_export_audit(*, action: str, user_id: int, total_rows: int, truncated: bool) -> None:
    try:
        _audit_security_event(
            action,
            user_id=user_id,
            details={
                "row_count": min(total_rows, EXPORT_CSV_MAX_ROWS),
                "truncated": truncated,
            },
        )
        db.session.commit()
    except Exception:  # noqa: BLE001 - transaction routes should rollback or skip non-critical work instead of corrupting the request flow.
        db.session.rollback()
        current_app.logger.exception(
            "Failed to record security event for transactions export user_id=%s action=%s",
            user_id,
            action,
        )


def _build_export_row(tx: Transaction) -> list[str]:
    merchant = _sanitize_spreadsheet_cell(tx.merchant_rel.name if tx.merchant_rel else "")
    memo = _sanitize_spreadsheet_cell(tx.memo or "")
    return [
        str(tx.id),
        tx.date.isoformat(),
        merchant,
        _sanitize_spreadsheet_cell(tx.category_rel.name if tx.category_rel else UNCAT_NAME),
        _sanitize_spreadsheet_cell(tx.name),
        format_kd(tx.amount_kd),
        memo,
    ]


def _iter_export_rows(SessionLocal, user_id: int, *, max_rows: int, chunk_size: int = 200):
    session = SessionLocal()
    try:
        query = (
            session.query(Transaction)
            .filter(Transaction.user_id == user_id)
            .options(
                joinedload(Transaction.merchant_rel),
                joinedload(Transaction.category_rel),
            )
            .order_by(Transaction.date.desc(), Transaction.id.desc())
            .yield_per(chunk_size)
        )

        emitted = 0
        for tx in query:
            if tx is None:
                continue
            if emitted >= max_rows:
                break
            yield _build_export_row(tx)
            emitted += 1
    finally:
        session.close()
