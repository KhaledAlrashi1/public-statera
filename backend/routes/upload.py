"""CSV/Excel upload, preview, and import routes."""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from difflib import SequenceMatcher
from typing import Any, Dict, List, Sequence

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from backend import db
from backend.api_response import error_response
from backend.constants import MAX_UPLOAD_ROWS, RATE_LIMIT_IMPORT, UNCAT_NAME
from backend.domain_errors import DomainError, DomainInternalError, DomainValidationError
from backend.lib.cache import cache_bust_dashboard_metrics, cache_bust_safe_to_spend
from backend.lib.categories import get_or_create_merchant, get_or_create_user_category
from backend.lib.importer import (
    ColumnMappingRequired,
    InvalidFileTypeError,
    _df_to_preview_rows,
    _parse_amount,
    compute_file_hash,
    compute_import_row_hash,
    safe_read_tabular_file,
)
from backend.money_math import format_kd
from backend.lib.validation import (
    parse_date as _parse_date_shared,
    parse_positive_amount as _parse_positive_amount_shared,
    ValidationError as _LibValidationError,
)
from backend.lib.suggestions import learn_transaction
from backend.lib.transactions import build_name_key
from backend.security_ops import rate_limit
from backend.lib.demo_data import (
    DEMO_REPLACED_WITH_IMPORT_EVENT,
    clear_demo_workspace,
    get_demo_workspace_state,
)
from backend.models import Category, Transaction
from backend.product_events import record_event, record_event_once

bp = Blueprint("upload", __name__)
_FILE_TOO_LARGE_RE = re.compile(r"File contains\s+([\d,]+)\s+rows", re.IGNORECASE)


@dataclass(frozen=True)
class ValidatedImportRow:
    row_index: int
    import_row_index: int | None
    transaction_id: int | None
    tx_date: date
    name: str
    category: str
    amount: Decimal
    base_name_key: str
    merchant: str | None
    memo: str | None
    triplet: tuple[date, str, Decimal]


@dataclass(frozen=True)
class PlannedImportRow:
    row: ValidatedImportRow
    existing_transaction_id: int | None = None
    import_row_hash: str | None = None


def _log_exception(event: str, *, error_code: str, **context) -> None:
    current_app.logger.exception(
        "%s error_code=%s context=%s",
        event,
        error_code,
        context,
    )


def _api_error(err: DomainError):
    return error_response(
        str(err),
        status=err.status_code,
        code=err.error_code,
        meta=err.context or {},
    )


def _norm_int(value: Any) -> int | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def _row_result(
    *,
    row_index: int,
    status: str,
    error_code: str | None = None,
    message: str | None = None,
    transaction_id: int | None = None,
    idempotency_key: str | None = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "row_index": int(row_index),
        "status": status,
    }
    if error_code:
        payload["error_code"] = error_code
    if message:
        payload["message"] = message
    if transaction_id is not None:
        payload["transaction_id"] = int(transaction_id)
    if idempotency_key:
        payload["idempotency_key"] = idempotency_key
    return payload


def _count_status(rows: Sequence[Dict[str, Any]], *statuses: str) -> int:
    wanted = set(statuses)
    return sum(1 for row in rows if row.get("status") in wanted)


def _ordered_row_results(total_rows: int, row_results: Dict[int, Dict[str, Any]]) -> list[Dict[str, Any]]:
    return [
        row_results.get(
            idx,
            _row_result(
                row_index=idx,
                status="failed_internal",
                error_code="import_row_unclassified",
                message="Row outcome missing.",
            ),
        )
        for idx in range(total_rows)
    ]


def _summarize_import_results(
    *,
    total_rows: int,
    valid_rows: int,
    planned_rows: int,
    row_results: Sequence[Dict[str, Any]],
) -> dict[str, int]:
    created = _count_status(row_results, "created")
    updated = _count_status(row_results, "updated")
    unchanged = _count_status(row_results, "unchanged")
    imported = created + updated
    auto_excluded = _count_status(row_results, "auto_excluded")
    skipped_duplicate = _count_status(row_results, "skipped_duplicate")
    skipped_idempotent = _count_status(row_results, "skipped_idempotent")
    skipped_invalid = _count_status(row_results, "skipped_invalid")
    failed_internal = _count_status(row_results, "failed_internal")
    skipped = skipped_invalid + failed_internal
    return {
        "total_rows": total_rows,
        "valid_rows": valid_rows,
        "planned_rows": planned_rows,
        "imported": imported,
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "auto_excluded": auto_excluded,
        "skipped": skipped,
        "skipped_invalid": skipped_invalid,
        "skipped_duplicate": skipped_duplicate,
        "skipped_idempotent": skipped_idempotent,
        "failed_internal": failed_internal,
    }


def _has_blocking_row_results(row_results: Sequence[Dict[str, Any]]) -> bool:
    return _count_status(row_results, "skipped_duplicate", "skipped_invalid", "failed_internal") > 0


def _validate_import_request(payload: Dict[str, Any]) -> tuple[List[Any], bool, bool, bool, str | None, str | None]:
    rows = payload.get("rows") or []
    allow_dups = bool(payload.get("allow_duplicates"))
    replace_demo_data = bool(payload.get("replace_demo_data"))
    file_hash = str(payload.get("file_hash") or "").strip() or None
    batch_id = str(payload.get("batch_id") or "").strip() or None
    # Keep accepting the legacy request field, but imports are now always
    # all-or-nothing so callers cannot opt into partial saves anymore.
    atomic = True

    if not isinstance(rows, list) or not rows:
        raise DomainValidationError("No rows provided.", error_code="import_rows_required")
    if len(rows) > MAX_UPLOAD_ROWS:
        raise DomainValidationError(
            f"Too many rows ({len(rows):,}). Maximum is {MAX_UPLOAD_ROWS:,}.",
            error_code="import_rows_limit_exceeded",
            context={"max_rows": MAX_UPLOAD_ROWS},
        )
    return rows, allow_dups, replace_demo_data, atomic, file_hash, batch_id


def _parse_import_amount(value_str: str | None) -> Decimal:
    try:
        amount = _parse_amount(value_str)
    except ValueError as exc:
        if "more than 3 decimal places" in str(exc).lower():
            raise ValueError(str(exc)) from exc
        raise ValueError(f"Invalid amount: {exc}") from exc
    except (InvalidOperation, TypeError) as exc:
        raise ValueError(f"Invalid amount: {exc}") from exc

    if amount > Decimal("999999.999"):
        raise ValueError("Amount too large (max 999999.999)")
    return amount


def _validate_import_row(
    raw_row: Any,
    row_index: int,
    *,
    allow_non_positive_amount: bool = False,
) -> ValidatedImportRow:
    if not isinstance(raw_row, dict):
        raise DomainValidationError(
            "Each row must be an object.",
            error_code="import_row_invalid",
            context={"row_index": row_index},
        )

    d_str = str(raw_row.get("date") or "").strip()
    name = str(raw_row.get("name") or "").strip()
    category = str(raw_row.get("category") or "").strip()
    amount_str = str(raw_row.get("amount_kd") or "").strip()
    merchant = str(raw_row.get("merchant") or "").strip() or None
    memo = str(raw_row.get("memo") or "").strip() or None
    transaction_id_raw = raw_row.get("transaction_id")
    import_row_index_raw = raw_row.get("row_index")
    transaction_id: int | None = None
    import_row_index: int | None = None

    if transaction_id_raw is not None and str(transaction_id_raw).strip():
        try:
            transaction_id = int(str(transaction_id_raw).strip())
        except (TypeError, ValueError) as exc:
            raise DomainValidationError(
                "transaction_id must be an integer.",
                error_code="import_row_invalid_value",
                context={"row_index": row_index},
            ) from exc

    if import_row_index_raw is not None and str(import_row_index_raw).strip():
        try:
            import_row_index = int(str(import_row_index_raw).strip())
        except (TypeError, ValueError) as exc:
            raise DomainValidationError(
                "row_index must be an integer.",
                error_code="import_row_invalid_value",
                context={"row_index": row_index},
            ) from exc
        if import_row_index < 0:
            raise DomainValidationError(
                "row_index must be greater than or equal to zero.",
                error_code="import_row_invalid_value",
                context={"row_index": row_index},
            )

    if not name or not amount_str:
        raise DomainValidationError(
            "Missing required fields",
            error_code="import_row_missing_fields",
            context={"row_index": row_index},
        )

    try:
        tx_date = _parse_date_shared(d_str)
    except ValueError as exc:
        code = "import_row_missing_date" if "date is required" in str(exc).lower() else "import_row_invalid_value"
        raise DomainValidationError(
            str(exc),
            error_code=code,
            context={"row_index": row_index},
        ) from exc
    try:
        amount = (
            _parse_import_amount(amount_str)
            if allow_non_positive_amount
            else _parse_positive_amount_shared(amount_str)
        )
    except ValueError as exc:
        code = "import_row_amount_non_positive" if "greater than zero" in str(exc) else "import_row_invalid_value"
        raise DomainValidationError(
            str(exc),
            error_code=code,
            context={"row_index": row_index},
        ) from exc

    base_name_key = build_name_key(name)
    return ValidatedImportRow(
        row_index=row_index,
        import_row_index=import_row_index,
        transaction_id=transaction_id,
        tx_date=tx_date,
        name=name,
        category=category,
        amount=amount,
        base_name_key=base_name_key,
        merchant=merchant,
        memo=memo,
        triplet=(tx_date, base_name_key, amount),
    )


def _validate_rows(rows: Sequence[Any], *, user_id: int) -> tuple[list[ValidatedImportRow], Dict[int, Dict[str, Any]]]:
    valid_rows: list[ValidatedImportRow] = []
    row_results: Dict[int, Dict[str, Any]] = {}
    for idx, raw_row in enumerate(rows):
        try:
            validated = _validate_import_row(raw_row, idx)
            valid_rows.append(validated)
        except _LibValidationError as err:
            row_results[idx] = _row_result(
                row_index=idx,
                status="skipped_invalid",
                error_code=err.error_code,
                message=str(err),
            )
            current_app.logger.info(
                "import_row_validation_failed error_code=%s context=%s",
                err.error_code,
                {"user_id": user_id, "row_index": idx},
            )
        except DomainValidationError as err:
            row_results[idx] = _row_result(
                row_index=idx,
                status="skipped_invalid",
                error_code=err.error_code,
                message=str(err),
            )
            current_app.logger.info(
                "import_row_validation_failed error_code=%s context=%s",
                err.error_code,
                {"user_id": user_id, "row_index": idx, **(err.context or {})},
            )
    return valid_rows, row_results


def _auto_excluded_reason(amount: Decimal) -> str:
    if amount == 0:
        return "Zero amounts are not supported."
    return (
        "Negative amounts are not supported. "
        "If this is an expense, enter the absolute value. "
        "Check whether your file uses negative values for debits."
    )


def _auto_excluded_row_payload(row: ValidatedImportRow, *, raw_amount: str) -> Dict[str, Any]:
    return {
        "row_index": row.row_index,
        "row_number": row.row_index + 1,
        "date": row.tx_date.isoformat(),
        "name": row.name,
        "raw_amount": raw_amount,
        "reason": _auto_excluded_reason(row.amount),
    }


def _validate_rows_for_commit(
    rows: Sequence[Any],
    *,
    user_id: int,
) -> tuple[list[ValidatedImportRow], Dict[int, Dict[str, Any]], list[Dict[str, Any]]]:
    valid_rows: list[ValidatedImportRow] = []
    row_results: Dict[int, Dict[str, Any]] = {}
    auto_excluded_rows: list[Dict[str, Any]] = []

    for idx, raw_row in enumerate(rows):
        raw_amount = ""
        if isinstance(raw_row, dict):
            raw_amount = str(raw_row.get("amount_kd") or "").strip()

        try:
            validated = _validate_import_row(
                raw_row,
                idx,
                allow_non_positive_amount=True,
            )
            if validated.amount <= 0:
                auto_excluded_row = _auto_excluded_row_payload(validated, raw_amount=raw_amount)
                auto_excluded_rows.append(auto_excluded_row)
                row_results[idx] = _row_result(
                    row_index=idx,
                    status="auto_excluded",
                    error_code="import_row_auto_excluded_non_positive",
                    message=auto_excluded_row["reason"],
                )
                continue

            valid_rows.append(validated)
        except _LibValidationError as err:
            row_results[idx] = _row_result(
                row_index=idx,
                status="skipped_invalid",
                error_code=err.error_code,
                message=str(err),
            )
            current_app.logger.info(
                "import_row_validation_failed error_code=%s context=%s",
                err.error_code,
                {"user_id": user_id, "row_index": idx},
            )
        except DomainValidationError as err:
            row_results[idx] = _row_result(
                row_index=idx,
                status="skipped_invalid",
                error_code=err.error_code,
                message=str(err),
            )
            current_app.logger.info(
                "import_row_validation_failed error_code=%s context=%s",
                err.error_code,
                {"user_id": user_id, "row_index": idx, **(err.context or {})},
            )

    return valid_rows, row_results, auto_excluded_rows


def _load_existing_triplets(user_id: int, triplets: set[tuple[date, str, Decimal]]) -> set[tuple[date, str, Decimal]]:
    if not triplets:
        return set()

    triplet_list = list(triplets)
    existing_triplets: set[tuple[date, str, Decimal]] = set()
    chunk_size = 500

    for i in range(0, len(triplet_list), chunk_size):
        chunk = triplet_list[i:i + chunk_size]
        conditions = [
            db.and_(
                Transaction.date == tx_date,
                Transaction.name_key == name_key,
                Transaction.amount_kd == amount,
            )
            for tx_date, name_key, amount in chunk
        ]
        existing = (
            Transaction.query
            .filter(Transaction.user_id == user_id)
            .filter(db.or_(*conditions))
            .with_entities(Transaction.date, Transaction.name_key, Transaction.amount_kd)
            .all()
        )
        existing_triplets.update((tx_date, name_key, amount) for tx_date, name_key, amount in existing)

    return existing_triplets


def _load_existing_item_triplets(user_id: int, triplets: set[tuple[date, str, Decimal]]) -> set[tuple[date, str, Decimal]]:
    return set()


def _load_existing_transactions_by_id(user_id: int, transaction_ids: set[int]) -> dict[int, Transaction]:
    if not transaction_ids:
        return {}

    rows = (
        Transaction.query
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.id.in_(sorted(transaction_ids)))
        .all()
    )
    return {int(row.id): row for row in rows}


def _load_existing_import_hashes(user_id: int, candidate_hashes: list[str]) -> set[str]:
    if not candidate_hashes:
        return set()

    rows = db.session.execute(
        db.select(Transaction.import_row_hash).where(
            Transaction.user_id == user_id,
            Transaction.import_row_hash.in_(candidate_hashes),
        )
    ).scalars().all()
    return {row for row in rows if row}


def _row_import_hashes(
    valid_rows: Sequence[ValidatedImportRow],
    *,
    user_id: int,
    file_hash: str | None,
) -> dict[int, str]:
    if not file_hash:
        return {}

    hashes: dict[int, str] = {}
    for row in valid_rows:
        if row.import_row_index is None:
            continue
        hashes[row.row_index] = compute_import_row_hash(
            user_id=user_id,
            date_str=row.tx_date.isoformat(),
            name_key=row.base_name_key,
            amount_kd=format_kd(row.amount),
            file_hash=file_hash,
            row_index=row.import_row_index,
        )
    return hashes


def _plan_rows(
    valid_rows: Sequence[ValidatedImportRow],
    *,
    user_id: int,
    file_hash: str | None,
    allow_dups: bool,
    existing_transactions_by_id: dict[int, Transaction],
) -> tuple[list[PlannedImportRow], Dict[int, Dict[str, Any]]]:
    plans: list[PlannedImportRow] = []
    row_results: Dict[int, Dict[str, Any]] = {}
    seen_transaction_ids: set[int] = set()
    row_hashes = _row_import_hashes(valid_rows, user_id=user_id, file_hash=file_hash)
    existing_import_hashes = _load_existing_import_hashes(user_id, list(row_hashes.values()))
    seen_import_hashes: set[str] = set()

    check_triplet_dups = not allow_dups and not file_hash
    seen_triplets: set[tuple] = set()

    for row in valid_rows:
        if row.transaction_id is not None:
            if row.transaction_id in seen_transaction_ids:
                row_results[row.row_index] = _row_result(
                    row_index=row.row_index,
                    status="skipped_invalid",
                    error_code="import_row_duplicate_batch",
                    message="Duplicate transaction_id within this import batch.",
                )
                continue
            existing_txn = existing_transactions_by_id.get(row.transaction_id)
            seen_transaction_ids.add(row.transaction_id)
            if existing_txn is not None:
                plans.append(
                    PlannedImportRow(
                        row=row,
                        existing_transaction_id=row.transaction_id,
                        import_row_hash=row_hashes.get(row.row_index),
                    )
                )
                continue

        if check_triplet_dups and row.transaction_id is None:
            if row.triplet in seen_triplets:
                row_results[row.row_index] = _row_result(
                    row_index=row.row_index,
                    status="skipped_duplicate",
                    error_code="import_row_duplicate_batch",
                    message="Duplicate row within this import batch.",
                )
                continue
            seen_triplets.add(row.triplet)

        import_row_hash = row_hashes.get(row.row_index)
        if import_row_hash:
            if import_row_hash in existing_import_hashes or import_row_hash in seen_import_hashes:
                row_results[row.row_index] = _row_result(
                    row_index=row.row_index,
                    status="skipped_idempotent",
                    error_code="import_row_idempotent",
                    message="Row already imported previously.",
                    idempotency_key=import_row_hash,
                )
                continue
            seen_import_hashes.add(import_row_hash)

        plans.append(
            PlannedImportRow(
                row=row,
                import_row_hash=import_row_hash,
            )
        )

    return plans, row_results


def _build_preview_duplicate_hints(rows: Sequence[Dict[str, Any]], *, user_id: int) -> dict[int, Dict[str, Any]]:
    valid_rows, _validation_results = _validate_rows(rows, user_id=user_id)
    if not valid_rows:
        return {}

    triplets = {row.triplet for row in valid_rows}
    existing_triplets = _load_existing_triplets(user_id, triplets)
    existing_triplets.update(_load_existing_item_triplets(user_id, triplets))
    existing_transactions_by_id = _load_existing_transactions_by_id(
        user_id,
        {row.transaction_id for row in valid_rows if row.transaction_id is not None},
    )

    hints: dict[int, Dict[str, Any]] = {}
    seen_triplets: set[tuple[date, str, Decimal]] = set()
    seen_transaction_ids: set[int] = set()

    for row in valid_rows:
        if row.transaction_id is not None:
            if row.transaction_id in seen_transaction_ids:
                hints[row.row_index] = {
                    "likely_dup": True,
                    "duplicate_reason": "import_row_duplicate_batch",
                    "duplicate_message": "Duplicate transaction_id within this import batch.",
                }
                continue

            existing_txn = existing_transactions_by_id.get(row.transaction_id)
            seen_transaction_ids.add(row.transaction_id)
            if existing_txn is not None:
                continue

        if row.triplet in seen_triplets:
            hints[row.row_index] = {
                "likely_dup": True,
                "duplicate_reason": "import_row_duplicate_batch",
                "duplicate_message": "Duplicate row within this import batch.",
            }
            continue

        if row.triplet in existing_triplets:
            hints[row.row_index] = {
                "likely_dup": True,
                "duplicate_reason": "import_row_duplicate_existing",
                "duplicate_message": "Duplicate row already exists.",
            }
            continue

        seen_triplets.add(row.triplet)

    fuzzy_hints = _build_preview_fuzzy_duplicate_hints(
        [
            row
            for row in valid_rows
            if row.row_index not in hints and row.transaction_id is None
        ],
        user_id=user_id,
    )
    for row_index, hint in fuzzy_hints.items():
        hints.setdefault(int(row_index), hint)

    return hints


def _normalized_fuzzy_name(name: str | None) -> str:
    normalized = build_name_key(name or "")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return " ".join(normalized.split())


def _is_similar_duplicate_name(left: str | None, right: str | None) -> bool:
    left_norm = _normalized_fuzzy_name(left)
    right_norm = _normalized_fuzzy_name(right)
    if not left_norm or not right_norm:
        return False
    if left_norm == right_norm:
        return True

    shorter, longer = sorted((left_norm, right_norm), key=len)
    if len(shorter) >= 6 and shorter in longer:
        return True

    ratio = SequenceMatcher(None, left_norm, right_norm).ratio()
    if ratio >= 0.82:
        return True

    left_tokens = set(left_norm.split())
    right_tokens = set(right_norm.split())
    if not left_tokens or not right_tokens:
        return False

    overlap = len(left_tokens & right_tokens) / max(1, min(len(left_tokens), len(right_tokens)))
    return overlap >= 0.6 and ratio >= 0.65


def _is_within_duplicate_date_window(left: date, right: date) -> bool:
    return abs((left - right).days) <= 1


def _preview_duplicate_hint(
    *,
    reason: str,
    candidate_name: str,
    candidate_date: date,
    in_batch: bool,
) -> Dict[str, Any]:
    scope_text = "another row in this file" if in_batch else "an existing transaction"
    candidate_title = (candidate_name or "Untitled transaction").strip()[:80]
    return {
        "likely_dup": True,
        "duplicate_reason": reason,
        "duplicate_message": (
            f"Potential match with {scope_text}: "
            f"\"{candidate_title}\" on {candidate_date.isoformat()} has the same amount and a near-matching date."
        ),
    }


def _load_existing_fuzzy_duplicate_candidates(
    valid_rows: Sequence[ValidatedImportRow],
    *,
    user_id: int,
) -> dict[Decimal, list[tuple[date, str]]]:
    if not valid_rows:
        return {}

    min_date = min(row.tx_date for row in valid_rows) - timedelta(days=1)
    max_date = max(row.tx_date for row in valid_rows) + timedelta(days=1)
    amounts = sorted({row.amount for row in valid_rows})

    rows = (
        Transaction.query
        .filter(Transaction.user_id == user_id)
        .filter(Transaction.date >= min_date)
        .filter(Transaction.date <= max_date)
        .filter(Transaction.amount_kd.in_(amounts))
        .with_entities(Transaction.date, Transaction.name, Transaction.amount_kd)
        .all()
    )

    candidates: dict[Decimal, list[tuple[date, str]]] = {}
    for tx_date, name, amount in rows:
        amount_key = Decimal(str(amount)).quantize(Decimal("0.001"))
        candidates.setdefault(amount_key, []).append((tx_date, str(name or "")))
    return candidates


def _build_preview_fuzzy_duplicate_hints(
    valid_rows: Sequence[ValidatedImportRow],
    *,
    user_id: int,
) -> dict[int, Dict[str, Any]]:
    if not valid_rows:
        return {}

    hints: dict[int, Dict[str, Any]] = {}
    existing_candidates = _load_existing_fuzzy_duplicate_candidates(valid_rows, user_id=user_id)

    for row in valid_rows:
        for candidate_date, candidate_name in existing_candidates.get(row.amount, []):
            if not _is_within_duplicate_date_window(row.tx_date, candidate_date):
                continue
            if not _is_similar_duplicate_name(row.name, candidate_name):
                continue
            hints[row.row_index] = _preview_duplicate_hint(
                reason="import_row_duplicate_fuzzy_existing",
                candidate_name=candidate_name,
                candidate_date=candidate_date,
                in_batch=False,
            )
            break

    rows_by_amount: dict[Decimal, list[ValidatedImportRow]] = {}
    for row in valid_rows:
        rows_by_amount.setdefault(row.amount, []).append(row)

    for siblings in rows_by_amount.values():
        if len(siblings) < 2:
            continue

        ordered = sorted(siblings, key=lambda row: (row.tx_date, row.row_index))
        for idx, row in enumerate(ordered):
            if row.row_index in hints:
                continue
            for other in ordered[idx + 1:]:
                if not _is_within_duplicate_date_window(row.tx_date, other.tx_date):
                    if other.tx_date > row.tx_date + timedelta(days=1):
                        break
                    continue
                if not _is_similar_duplicate_name(row.name, other.name):
                    continue
                hint = _preview_duplicate_hint(
                    reason="import_row_duplicate_fuzzy_batch",
                    candidate_name=other.name,
                    candidate_date=other.tx_date,
                    in_batch=True,
                )
                hints[row.row_index] = hint
                hints.setdefault(other.row_index, _preview_duplicate_hint(
                    reason="import_row_duplicate_fuzzy_batch",
                    candidate_name=row.name,
                    candidate_date=row.tx_date,
                    in_batch=True,
                ))
                break

    return hints


def _get_or_create_category_cached(cache: Dict[str, Category], *, name: str, user_id: int):
    key = (name or "").strip().lower() or "__none__"
    if key in cache:
        return cache[key]
    category = get_or_create_user_category(name, user_id)
    cache[key] = category
    return category


def _transaction_matches_atomic_row(
    txn: Transaction,
    row: ValidatedImportRow,
    *,
    category_id: int,
    merchant_id: int | None,
) -> bool:
    if (
        txn.date != row.tx_date
        or int(txn.category_id or 0) != int(category_id or 0)
        or int(txn.merchant_id or 0) != int(merchant_id or 0)
        or (txn.name or "") != row.name
        or (txn.memo or None) != (row.memo or None)
        or txn.amount_kd != row.amount
    ):
        return False
    return True


def _persist_planned_row(
    *,
    plan: PlannedImportRow,
    user_id: int,
    category_cache: Dict[str, Category],
    batch_id: str | None,
) -> tuple[int, str]:
    row = plan.row
    category = _get_or_create_category_cached(category_cache, name=row.category, user_id=user_id)
    merchant = get_or_create_merchant(row.merchant, user_id) if row.merchant else None

    if plan.existing_transaction_id is not None:
        txn = (
            Transaction.query
            .filter_by(id=plan.existing_transaction_id, user_id=user_id)
            .first()
        )
        if txn is None:
            raise DomainValidationError(
                "transaction_id does not match a transaction you own.",
                error_code="import_row_transaction_not_found",
                context={"row_index": row.row_index},
            )

        if _transaction_matches_atomic_row(
            txn,
            row,
            category_id=category.id if category else None,
            merchant_id=merchant.id if merchant else None,
        ):
            return int(txn.id), "unchanged"

        txn.date = row.tx_date
        txn.category_id = category.id if category else None
        txn.merchant_id = merchant.id if merchant else None
        txn.name = row.name
        txn.memo = row.memo
        txn.name_key = row.base_name_key
        txn.amount_kd = row.amount
        txn.import_batch_id = batch_id
        txn.import_row_hash = plan.import_row_hash
        learn_transaction(row.name, user_id, category_id=category.id if category else None, merchant_id=merchant.id if merchant else None)
        return int(txn.id), "updated"

    txn = Transaction(
        date=row.tx_date,
        category_id=category.id if category else None,
        merchant_id=merchant.id if merchant else None,
        name=row.name,
        memo=row.memo,
        name_key=row.base_name_key,
        amount_kd=row.amount,
        user_id=user_id,
        source="csv_import",
        import_batch_id=batch_id,
        import_row_hash=plan.import_row_hash,
    )

    db.session.add(txn)
    learn_transaction(row.name, user_id, category_id=category.id if category else None, merchant_id=merchant.id if merchant else None)
    return int(txn.id), "created"


def _log_row_validation_failure(event: str, err: DomainValidationError, *, user_id: int, row_index: int) -> None:
    current_app.logger.info(
        "%s error_code=%s context=%s",
        event,
        err.error_code,
        {"user_id": user_id, "row_index": row_index, **(err.context or {})},
    )


def _row_result_applied(row: ValidatedImportRow, txn_id: int, status: str) -> Dict[str, Any]:
    return _row_result(
        row_index=row.row_index,
        status=status,
        transaction_id=txn_id,
    )


def _row_result_idempotent(row: ValidatedImportRow, *, idempotency_key: str | None) -> Dict[str, Any]:
    return _row_result(
        row_index=row.row_index,
        status="skipped_idempotent",
        error_code="import_row_idempotent",
        message="Row already imported previously.",
        idempotency_key=idempotency_key,
    )


def _row_result_invalid(row: ValidatedImportRow, err: DomainValidationError) -> Dict[str, Any]:
    return _row_result(
        row_index=row.row_index,
        status="skipped_invalid",
        error_code=err.error_code,
        message=str(err),
    )


def _row_result_db_failed(row: ValidatedImportRow) -> Dict[str, Any]:
    return _row_result(
        row_index=row.row_index,
        status="failed_internal",
        error_code="import_row_db_error",
        message="Database error while importing row.",
    )


def _persist_plan_with_savepoint(
    *,
    plan: PlannedImportRow,
    user_id: int,
    category_cache: Dict[str, Category],
    batch_id: str | None,
) -> tuple[int, str]:
    savepoint = db.session.begin_nested()
    try:
        txn_id, outcome = _persist_planned_row(
            plan=plan,
            user_id=user_id,
            category_cache=category_cache,
            batch_id=batch_id,
        )
        savepoint.commit()
        return txn_id, outcome
    except Exception:  # noqa: BLE001 - upload preview and import cleanup should skip bad rows instead of aborting the whole upload.
        savepoint.rollback()
        raise


def _apply_plan_with_retry(
    *,
    plan: PlannedImportRow,
    user_id: int,
    category_cache: Dict[str, Category],
    batch_id: str | None,
) -> Dict[str, Any]:
    row = plan.row
    try:
        txn_id, outcome = _persist_plan_with_savepoint(
            plan=plan,
            user_id=user_id,
            category_cache=category_cache,
            batch_id=batch_id,
        )
        return _row_result_applied(row, txn_id, outcome)
    except IntegrityError:
        if plan.import_row_hash:
            return _row_result_idempotent(row, idempotency_key=plan.import_row_hash)
        _log_exception(
            "import_row_integrity_failed",
            error_code="import_row_db_error",
            user_id=user_id,
            row_index=row.row_index,
        )
        return _row_result_db_failed(row)
    except DomainValidationError as err:
        _log_row_validation_failure(
            "import_row_apply_validation_failed",
            err,
            user_id=user_id,
            row_index=row.row_index,
        )
        return _row_result_invalid(row, err)
    except SQLAlchemyError:
        _log_exception(
            "import_row_failed",
            error_code="import_row_db_error",
            user_id=user_id,
            row_index=row.row_index,
        )
        return _row_result_db_failed(row)


@bp.route("/api/transactions/upload-preview", methods=["POST"])
@rate_limit(RATE_LIMIT_IMPORT)
@login_required
def upload_preview():
    file = request.files.get("file")
    if not file or not file.filename:
        return error_response(
            "Please choose a CSV or Excel file.",
            status=400,
            code="upload_preview_file_required",
        )

    # Optional: user-provided column mapping (submitted after mapping UI step).
    user_mapping = None
    column_map_raw = request.form.get("column_map")
    if column_map_raw:
        try:
            user_mapping = json.loads(column_map_raw)
            if not isinstance(user_mapping, dict):
                raise ValueError("column_map must be a JSON object")
        except (json.JSONDecodeError, ValueError):
            return error_response(
                "Invalid column_map value.",
                status=400,
                code="upload_preview_invalid_mapping",
            )

    file.stream.seek(0)
    file_hash = compute_file_hash(file.read())
    file.stream.seek(0)

    try:
        df, original_cols = safe_read_tabular_file(file, user_mapping=user_mapping)
        rows, skipped, flagged_rows, skipped_rows = _df_to_preview_rows(df)
    except ColumnMappingRequired as e:
        # File is missing required schema fields.
        display_map = {"date": "date", "name": "name", "amount": "amount_kd", "amount_kd": "amount_kd"}
        missing_columns = [display_map.get(col, col) for col in e.missing_required]
        missing_text = ", ".join(missing_columns) if missing_columns else "date, name, amount_kd"
        return error_response(
            f"Missing required columns: {missing_text}.",
            status=400,
            code="MISSING_COLUMNS",
            meta={
                "missing_columns": missing_columns,
                "all_columns": e.all_columns,
                "suggested_mapping": e.suggested_mapping,
                "raw_rows": e.raw_rows,
            },
        )
    except InvalidFileTypeError as err:
        return error_response(
            str(err),
            status=400,
            code="invalid_file_type",
        )
    except UnicodeDecodeError:
        return error_response(
            "CSV files must be UTF-8 encoded.",
            status=400,
            code="NON_UTF8_FILE",
        )
    except ValueError as err:
        message = str(err)
        lowered = message.lower()
        if "utf-8" in lowered and ("decode" in lowered or "encoded" in lowered):
            return error_response(
                "CSV files must be UTF-8 encoded.",
                status=400,
                code="NON_UTF8_FILE",
            )
        if "file is empty" in lowered or "no columns to parse from file" in lowered:
            return error_response(
                "Uploaded file contains no data rows.",
                status=400,
                code="EMPTY_FILE",
            )
        if "exceeds the limit" in lowered:
            row_count = None
            match = _FILE_TOO_LARGE_RE.search(message)
            if match:
                try:
                    row_count = int(match.group(1).replace(",", ""))
                except Exception:  # noqa: BLE001 - upload preview and import cleanup should skip bad rows instead of aborting the whole upload.
                    row_count = None
            meta: Dict[str, Any] = {"max_rows": MAX_UPLOAD_ROWS}
            if row_count is not None:
                meta["row_count"] = row_count
            return error_response(
                message,
                status=400,
                code="FILE_TOO_LARGE",
                meta=meta,
            )
        return error_response(message, status=400, code="upload_preview_invalid_file")
    except RuntimeError as err:
        return error_response(str(err), status=400, code="upload_preview_invalid_file")
    except (TypeError, AttributeError, InvalidOperation):
        return error_response(
            "Failed to process file. Please check the format.",
            status=400,
            code="upload_preview_parse_failed",
        )

    if len(df) == 0:
        return error_response(
            "Uploaded file contains no data rows.",
            status=400,
            code="EMPTY_FILE",
        )
    if not rows:
        if flagged_rows:
            return error_response(
                "No valid rows were found. All amount values were negative or zero. "
                "Check if your file uses negative values for expenses — enter the absolute value instead.",
                status=400,
                code="INVALID_ROWS",
                meta={
                    "input_rows": len(df),
                    "skipped_rows": skipped,
                    "skipped_row_details": skipped_rows[:100],
                    "skipped_row_count": len(skipped_rows),
                    "flagged_rows": flagged_rows[:50],
                    "flagged_count": len(flagged_rows),
                },
            )
        return error_response(
            "No valid rows were found. Check date and amount formats.",
            status=400,
            code="INVALID_ROWS",
            meta={
                "input_rows": len(df),
                "skipped_rows": skipped,
                "skipped_row_details": skipped_rows[:100],
                "skipped_row_count": len(skipped_rows),
            },
        )

    preview_cap = 2000
    preview_rows = rows[:preview_cap]
    preview_duplicate_hints = _build_preview_duplicate_hints(preview_rows, user_id=current_user.id)
    for idx, row in enumerate(preview_rows):
        if idx in preview_duplicate_hints:
            row.update(preview_duplicate_hints[idx])
    capped = len(rows) > preview_cap
    rows_truncated = max(len(rows) - preview_cap, 0)

    return jsonify(
        {
            "ok": True,
            "count": len(rows),
            "preview_count": len(preview_rows),
            "skipped": skipped,
            "skipped_rows": skipped_rows[:100],
            "skipped_row_count": len(skipped_rows),
            "flagged_count": len(flagged_rows),
            "flagged_rows": flagged_rows[:50],
            "capped": capped,
            "rows_truncated": rows_truncated,
            "preview_rows": preview_rows,
            "file_hash": file_hash,
            "original_columns": original_cols,
            "schema": ["transaction_id", "date", "merchant", "category", "name", "amount_kd", "memo"],
            "note": "Edit rows client-side, then POST to /transactions/import-commit.",
        }
    )


@bp.route("/api/transactions/import-commit", methods=["POST"])
@rate_limit(RATE_LIMIT_IMPORT)
@login_required
def import_commit():
    payload = request.get_json(silent=True) or {}

    try:
        rows, allow_dups, replace_demo_data, atomic, file_hash, batch_id = _validate_import_request(payload)
    except DomainValidationError as err:
        return _api_error(err)

    import_batch_id = batch_id or (str(uuid.uuid4()) if file_hash else None)

    demo_workspace = get_demo_workspace_state(int(current_user.id))
    demo_replaced_summary: Dict[str, Any] | None = None
    if demo_workspace.get("active") and not replace_demo_data:
        return error_response(
            "Demo data is still active. Clear it or replace it during import to avoid mixing sample and real records.",
            status=409,
            code="demo_data_replace_required",
            meta=demo_workspace,
        )

    valid_rows, row_results, auto_excluded_rows = _validate_rows_for_commit(rows, user_id=current_user.id)

    existing_transactions_by_id = _load_existing_transactions_by_id(
        current_user.id,
        {row.transaction_id for row in valid_rows if row.transaction_id is not None},
    )

    plans, planning_results = _plan_rows(
        valid_rows,
        user_id=current_user.id,
        file_hash=file_hash,
        allow_dups=allow_dups,
        existing_transactions_by_id=existing_transactions_by_id,
    )
    row_results.update(planning_results)
    precheck_has_blockers = _has_blocking_row_results(list(row_results.values()))
    if atomic and precheck_has_blockers:
        for plan in plans:
            row_results.setdefault(
                plan.row.row_index,
                _row_result(
                    row_index=plan.row.row_index,
                    status="blocked_atomic",
                    error_code="import_atomic_pending",
                    message="This row was not saved because another row in the batch needs attention.",
                ),
            )
        ordered_results = _ordered_row_results(len(rows), row_results)
        summary = _summarize_import_results(
            total_rows=len(rows),
            valid_rows=len(valid_rows),
            planned_rows=len(plans),
            row_results=ordered_results,
        )
        return error_response(
            "Import blocked. Fix or exclude the flagged rows, then try again.",
            status=409,
            code="import_atomic_precheck_failed",
            meta={
                "row_results": ordered_results,
                "summary": summary,
                "auto_excluded_count": len(auto_excluded_rows),
                "auto_excluded_rows": auto_excluded_rows,
            },
        )

    if demo_workspace.get("active") and replace_demo_data and plans:
        try:
            demo_replaced_summary = clear_demo_workspace(int(current_user.id))
        except Exception:  # noqa: BLE001 - upload preview and import cleanup should skip bad rows instead of aborting the whole upload.
            db.session.rollback()
            _log_exception(
                "demo_workspace_replace_failed",
                error_code="demo_workspace_replace_failed",
                user_id=current_user.id,
            )
            return _api_error(
                DomainInternalError(
                    "Failed to replace demo data before import.",
                    error_code="demo_workspace_replace_failed",
                )
            )

    category_cache: Dict[str, Category] = {}

    for plan in plans:
        result = _apply_plan_with_retry(
            plan=plan,
            user_id=current_user.id,
            category_cache=category_cache,
            batch_id=import_batch_id,
        )
        row_results[plan.row.row_index] = result

    ordered_results = _ordered_row_results(len(rows), row_results)
    summary = _summarize_import_results(
        total_rows=len(rows),
        valid_rows=len(valid_rows),
        planned_rows=len(plans),
        row_results=ordered_results,
    )
    created = summary["created"]
    updated = summary["updated"]
    unchanged = summary["unchanged"]
    imported = summary["imported"]
    skipped_duplicate = summary["skipped_duplicate"]
    skipped_idempotent = summary["skipped_idempotent"]
    failed_internal = summary["failed_internal"]
    skipped = summary["skipped"]

    if atomic and _has_blocking_row_results(ordered_results):
        db.session.rollback()
        rolled_back_rows = 0
        rollback_results: list[Dict[str, Any]] = []
        for result in ordered_results:
            if result.get("status") in {"created", "updated"}:
                rolled_back_rows += 1
                rollback_results.append(
                    {
                        **result,
                        "status": "rolled_back",
                        "error_code": "import_atomic_rolled_back",
                        "message": "This row was not saved because another row in the batch failed.",
                    }
                )
                continue
            rollback_results.append(result)
        rollback_summary = {
            **summary,
            "imported": 0,
            "created": 0,
            "updated": 0,
            "rolled_back": rolled_back_rows,
        }
        rollback_message = (
            "Import rolled back. Fix the flagged rows and try again so the batch can import cleanly."
            if rolled_back_rows > 0
            else "Import blocked during commit. No rows were saved. Fix or exclude the flagged rows, then try again."
        )
        return error_response(
            rollback_message,
            status=409,
            code="import_atomic_apply_failed",
            meta={
                "row_results": rollback_results,
                "summary": rollback_summary,
                "auto_excluded_count": len(auto_excluded_rows),
                "auto_excluded_rows": auto_excluded_rows,
            },
        )

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        _log_exception(
            "import_commit_failed",
            error_code="import_commit_failed",
            user_id=current_user.id,
        )
        return _api_error(DomainInternalError("Commit failed. Please try again.", error_code="import_commit_failed"))

    if imported > 0:
        try:
            record_event(
                "import_performed",
                current_user.id,
                properties={"imported": imported},
                commit=False,
            )
            record_event_once(
                "import_completed",
                current_user.id,
                properties={"imported": imported},
                commit=False,
            )
            if demo_replaced_summary is not None:
                record_event(
                    DEMO_REPLACED_WITH_IMPORT_EVENT,
                    current_user.id,
                    properties={
                        "imported": imported,
                        **demo_replaced_summary,
                    },
                    commit=False,
                )
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()
            _log_exception(
                "import_event_record_failed",
                error_code="import_event_record_failed",
                user_id=current_user.id,
                imported=imported,
            )

    if imported > 0 or demo_replaced_summary is not None:
        cache_bust_dashboard_metrics(current_user.id)
        cache_bust_safe_to_spend(current_user.id)

    return jsonify(
        {
            "ok": True,
            "imported": imported,
            "imported_count": imported,
            "created": created,
            "updated": updated,
            "unchanged": unchanged,
            "import_batch_id": import_batch_id,
            "skipped": skipped,
            "skipped_duplicate": skipped_duplicate,
            "skipped_idempotent": skipped_idempotent,
            "failed_internal": failed_internal,
            "auto_excluded_count": len(auto_excluded_rows),
            "auto_excluded_rows": auto_excluded_rows,
            "row_results": ordered_results,
            "summary": summary,
            "demo_workspace_replaced": demo_replaced_summary,
        }
    )


