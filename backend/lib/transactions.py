"""Transaction validation and creation helpers."""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import or_

from backend import db
from backend.lib.categories import get_or_create_category, get_or_create_merchant
from backend.lib.suggestions import learn_transaction
from backend.lib.validation import ValidationError, parse_date, parse_positive_amount


def build_name_key(name: str) -> str:
    return " ".join((name or "").split()).lower()[:255] or "?"


def validate_transaction_input(data: Dict) -> Dict[str, Any]:
    errors = []
    result = {}

    try:
        date_str = (data.get("date") or "").strip()
        if not date_str:
            errors.append("Date is required")
        else:
            result["date"] = parse_date(date_str)
    except ValueError as exc:
        errors.append(str(exc))

    category_name = (data.get("category") or "").strip()
    if category_name and len(category_name) > 64:
        errors.append("Category name too long (max 64 characters)")
    else:
        result["category_name"] = category_name or None

    name = (data.get("name") or "").strip()
    if not name:
        errors.append("Name is required")
    elif len(name) > 255:
        errors.append("Name too long (max 255 characters)")
    else:
        result["name"] = name

    try:
        amount_str = (data.get("amount_kd") or "").strip()
        if not amount_str:
            errors.append("Amount is required")
        else:
            result["amount"] = parse_positive_amount(amount_str)
    except ValueError as exc:
        errors.append(str(exc))

    merchant_name = (data.get("merchant") or "").strip()
    if merchant_name and len(merchant_name) > 128:
        errors.append("Merchant name too long (max 128 characters)")
    else:
        result["merchant_name"] = merchant_name if merchant_name else None

    if errors:
        raise ValidationError("; ".join(errors))

    return result


def force_unique_name_key(
    txn_date: date,
    base_name: str,
    amount: Decimal,
    user_id: int,
    *,
    exclude_transaction_id: int | None = None,
) -> str:
    """Return a unique name_key for a forced-duplicate insert."""
    from backend.models import Transaction

    base = build_name_key(base_name)
    like_pattern = f"{base}#%"

    query = (
        Transaction.query
        .with_entities(Transaction.name_key)
        .filter(Transaction.date == txn_date)
        .filter(Transaction.amount_kd == amount)
        .filter(Transaction.user_id == user_id)
        .filter(or_(
            Transaction.name_key == base,
            Transaction.name_key.like(like_pattern),
        ))
    )
    if exclude_transaction_id is not None:
        query = query.filter(Transaction.id != int(exclude_transaction_id))

    existing_keys = {
        row.name_key
        for row in query.all()
    }

    if base not in existing_keys:
        return base

    max_suffix = 1
    for key in existing_keys:
        if key == base:
            continue
        try:
            suffix = int(key.rsplit("#", 1)[1])
            max_suffix = max(max_suffix, suffix)
        except (IndexError, ValueError):
            pass

    return f"{base}#{max_suffix + 1}"
def create_transaction_with_dup_check(
    txn_date: date,
    category_name: str | None,
    name: str,
    amount: Decimal,
    user_id: int,
    force: bool = False,
    merchant_name: str | None = None,
    source: str = "manual",
) -> Tuple[Any, bool, Optional[str]]:
    from backend.models import Transaction

    try:
        if not name:
            return None, False, "Name is required"

        category = get_or_create_category(category_name, user_id) if category_name else None
        merchant = get_or_create_merchant(merchant_name, user_id) if merchant_name else None
        base_key = build_name_key(name)

        dup_count = (
            Transaction.query
            .filter(Transaction.date == txn_date)
            .filter(Transaction.name_key == base_key)
            .filter(Transaction.amount_kd == amount)
            .filter(Transaction.user_id == user_id)
            .count()
        )

        if dup_count > 0 and not force:
            return None, True, "Potential duplicate found. Confirm to add anyway."

        if force and dup_count > 0:
            name_key = force_unique_name_key(txn_date, name, amount, user_id)
        else:
            name_key = base_key

        txn = Transaction(
            date=txn_date,
            category_id=category.id if category else None,
            merchant_id=merchant.id if merchant else None,
            name=name,
            name_key=name_key,
            amount_kd=amount,
            user_id=user_id,
            source=(source or "manual"),
        )

        db.session.add(txn)
        with db.session.no_autoflush:
            learn_transaction(name, user_id, category.name if category else None, merchant.name if merchant else None)
        return txn, False, None
    except Exception:  # noqa: BLE001 - transaction serialization should fall back to a safe default when optional enrichment fails.
        logging.getLogger(__name__).exception("create_transaction_with_dup_check failed")
        return None, False, "Failed to create transaction."
