"""Memorized transaction and template suggestion helpers."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Tuple

from sqlalchemy import or_

from backend import db
from backend.constants import MEMORIZED_PRUNE_DAYS_COUNT_1, MEMORIZED_PRUNE_DAYS_COUNT_2, UNCAT_NAME
from backend.money_math import format_kd
from backend.lib.validation import ValidationError


_txn_nonword = re.compile(r"[^a-z0-9\u0621-\u064A]+", re.U)
_template_feedback_key_re = re.compile(r"^[0-9a-f]{64}$")


def _txn_norm(value: str | None) -> str:
    """Normalize transaction name."""
    normalized = (value or "").lower().strip()
    normalized = _txn_nonword.sub(" ", normalized)
    normalized = re.sub(r"\b(\d{3,})\b", " ", normalized)
    normalized = " ".join(normalized.split())
    return normalized[:255]


def build_template_feedback_key(merchant_name: str | None, tx_items: List[Dict[str, str]]) -> str:
    """Build a stable key for a template suggestion signature."""
    normalized_signature = {
        "merchant": _txn_norm(merchant_name or ""),
        "items": [
            {
                "name": _txn_norm(item.get("name")),
                "category": _txn_norm(item.get("category")),
                "amount_kd": str(item.get("amount_kd") or "").strip(),
            }
            for item in tx_items
        ],
    }
    encoded = json.dumps(normalized_signature, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def validate_template_feedback_key(feedback_key: str | None) -> str:
    key = (feedback_key or "").strip().lower()
    if not _template_feedback_key_re.fullmatch(key):
        raise ValidationError("feedback_key is invalid.")
    return key


def _template_feedback_score(accepted_count: int, rejected_count: int) -> int:
    return min(24, max(0, int(accepted_count)) * 4) - min(24, max(0, int(rejected_count)) * 6)


def record_template_suggestion_feedback(
    *,
    user_id: int,
    feedback_key: str,
    outcome: str,
) -> Dict[str, Any]:
    """Upsert feedback counters for a template suggestion signature."""
    from backend.models import TemplateSuggestionFeedback

    key = validate_template_feedback_key(feedback_key)
    normalized_outcome = (outcome or "").strip().lower()
    if normalized_outcome not in {"accepted", "rejected"}:
        raise ValidationError("outcome must be either 'accepted' or 'rejected'.")

    row = TemplateSuggestionFeedback.query.filter_by(user_id=user_id, signature_key=key).first()
    now = datetime.now(timezone.utc)
    if not row:
        row = TemplateSuggestionFeedback(
            user_id=user_id,
            signature_key=key,
            accepted_count=0,
            rejected_count=0,
            created_at=now,
            updated_at=now,
        )
        db.session.add(row)

    if normalized_outcome == "accepted":
        row.accepted_count = int(row.accepted_count or 0) + 1
        row.last_accepted_at = now
    else:
        row.rejected_count = int(row.rejected_count or 0) + 1
        row.last_rejected_at = now
    row.updated_at = now
    db.session.flush()

    accepted_count = int(row.accepted_count or 0)
    rejected_count = int(row.rejected_count or 0)
    return {
        "feedback_key": key,
        "accepted_count": accepted_count,
        "rejected_count": rejected_count,
        "score": _template_feedback_score(accepted_count, rejected_count),
    }


def prune_stale_memorized_transactions(user_id: int, now: datetime | None = None) -> int:
    """Delete stale memorized rows for a single user (called inline on transaction save)."""
    from backend.models import MemorizedTransaction

    now = now or datetime.now(timezone.utc)
    cutoff_1 = now - timedelta(days=MEMORIZED_PRUNE_DAYS_COUNT_1)
    cutoff_2 = now - timedelta(days=MEMORIZED_PRUNE_DAYS_COUNT_2)

    return (
        MemorizedTransaction.query
        .filter(MemorizedTransaction.user_id == user_id)
        .filter(MemorizedTransaction.is_pinned.is_(False))
        .filter(or_(
            db.and_(MemorizedTransaction.count == 1, MemorizedTransaction.last_seen < cutoff_1),
            db.and_(MemorizedTransaction.count == 2, MemorizedTransaction.last_seen < cutoff_2),
        ))
        .delete(synchronize_session=False)
    )


def prune_all_stale_memorized_transactions(now: datetime | None = None) -> int:
    """Delete stale memorized rows across all users (Celery job).

    Prune rules:
      - Pinned rows: never pruned.
      - count == 1 AND last_seen < now - 3 months → prune.
      - count == 2 AND last_seen < now - 6 months → prune.
      - count >= 3 → never auto-pruned.
    """
    from backend.models import MemorizedTransaction

    now = now or datetime.now(timezone.utc)
    cutoff_1 = now - timedelta(days=MEMORIZED_PRUNE_DAYS_COUNT_1)
    cutoff_2 = now - timedelta(days=MEMORIZED_PRUNE_DAYS_COUNT_2)

    deleted_1 = (
        MemorizedTransaction.query
        .filter(
            MemorizedTransaction.is_pinned.is_(False),
            MemorizedTransaction.count == 1,
            MemorizedTransaction.last_seen < cutoff_1,
        )
        .delete(synchronize_session=False)
    )
    deleted_2 = (
        MemorizedTransaction.query
        .filter(
            MemorizedTransaction.is_pinned.is_(False),
            MemorizedTransaction.count == 2,
            MemorizedTransaction.last_seen < cutoff_2,
        )
        .delete(synchronize_session=False)
    )
    total = deleted_1 + deleted_2
    if total:
        db.session.commit()
    import logging
    logging.getLogger(__name__).info(
        "pruned %d memorized rows (%d with count=1 over 3mo, %d with count=2 over 6mo)",
        total, deleted_1, deleted_2,
    )
    return total


def rebuild_memorized_from_transactions(user_id: int) -> dict[str, int]:
    """Replay all transactions for a user through learn_transaction().

    Used for data recovery after the prune function deleted memorized entries.
    Returns the number of transactions processed.
    """
    from backend.models import Transaction

    rows = (
        db.session.query(
            Transaction.name,
            Transaction.category_id,
            Transaction.merchant_id,
        )
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.date.asc(), Transaction.id.asc())
        .all()
    )

    for tx_name, category_id, merchant_id in rows:
        learn_transaction(tx_name, user_id, category_id=category_id, merchant_id=merchant_id)

    db.session.commit()
    return {"transactions_processed": len(rows)}


def learn_transaction(
    name: str,
    user_id: int,
    category_id: int | None = None,
    merchant_id: int | None = None,
) -> None:
    """Upsert memorized transaction in the current session."""
    from backend.models import MemorizedTransaction

    normalized = _txn_norm(name)
    if not normalized:
        return
    row = MemorizedTransaction.query.filter_by(norm=normalized, user_id=user_id).first()
    now = datetime.now(timezone.utc)
    if row:
        row.count = int(row.count or 0) + 1
        row.last_seen = now
        if category_id and not row.category_id:
            row.category_id = category_id
        if merchant_id and not row.merchant_id:
            row.merchant_id = merchant_id
    else:
        db.session.add(
            MemorizedTransaction(
                canonical=(name or "").strip()[:255],
                norm=normalized,
                category_id=category_id,
                merchant_id=merchant_id,
                count=1,
                last_seen=now,
                user_id=user_id,
            )
        )


def suggest_transactions(q: str, user_id: int, limit: int = 10) -> List[Dict[str, Any]]:
    """Suggest memorized transactions matching the query."""
    from backend.models import MemorizedTransaction

    normalized = _txn_norm(q)
    if not normalized:
        return []
    token = normalized.split(" ", 1)[0]
    like_norm = f"%{token}%"
    like_can = f"%{q}%"
    rows = (
        MemorizedTransaction.query
        .filter(or_(MemorizedTransaction.norm.like(like_norm), MemorizedTransaction.canonical.ilike(like_can)))
        .filter(MemorizedTransaction.user_id == user_id)
        .order_by(MemorizedTransaction.count.desc(), MemorizedTransaction.last_seen.desc())
        .limit(limit)
        .all()
    )
    return [row.to_dict() for row in rows]


def suggest_transaction_templates(q: str, user_id: int, limit: int = 3) -> List[Dict[str, Any]]:
    """Suggest full transaction templates from recent matching transactions."""
    from backend.models import Category, Merchant, TemplateSuggestionFeedback, Transaction

    raw_q = (q or "").strip()
    normalized = _txn_norm(raw_q)
    if len(normalized) < 2:
        return []

    limit = max(1, min(int(limit or 3), 5))
    like = f"%{raw_q}%"

    txn_rows = (
        db.session.query(
            Transaction.id,
            Transaction.date,
            Transaction.name,
            Transaction.amount_kd,
            Category.name,
            Merchant.name,
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .outerjoin(Merchant, Transaction.merchant_id == Merchant.id)
        .filter(Transaction.user_id == user_id)
        .filter(
            or_(
                Transaction.name.ilike(like),
                Merchant.name.ilike(like),
                Category.name.ilike(like),
            )
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(200)
        .all()
    )

    if not txn_rows:
        return []

    def _score(tx_name: str, merchant_name: str, category_name: str) -> int:
        lowered_query = raw_q.lower()
        score = 0
        fields = [tx_name or "", merchant_name or "", category_name or ""]
        for field in fields:
            lowered_field = field.lower()
            if not lowered_field:
                continue
            if lowered_field.startswith(lowered_query):
                score += 3
            elif lowered_query in lowered_field:
                score += 1
        return score

    seen_signatures = set()
    candidates: List[Tuple[int, int, str, Dict[str, Any]]] = []
    for tx_id, tx_date, tx_name, tx_amount, category_name, merchant_name in txn_rows:
        tx_items = [{
            "name": (tx_name or "").strip(),
            "category": (category_name or UNCAT_NAME).strip(),
            "amount_kd": format_kd(tx_amount),
        }]

        signature_key = build_template_feedback_key(merchant_name, tx_items)
        if signature_key in seen_signatures:
            continue
        seen_signatures.add(signature_key)

        primary_name = tx_items[0]["name"] if tx_items else (tx_name or "")
        payload = {
            "transaction_id": tx_id,
            "date": tx_date.isoformat() if tx_date else "",
            "name": primary_name,
            "merchant": merchant_name or "",
            "amount_kd": format_kd(tx_amount),
            "items": tx_items,
            "feedback_key": signature_key,
        }
        ts = int(datetime.combine(tx_date, datetime.min.time()).timestamp()) if tx_date else 0
        candidates.append((_score(tx_name or "", merchant_name or "", category_name or ""), ts, signature_key, payload))

    if not candidates:
        return []

    feedback_by_key: Dict[str, Any] = {}
    signature_keys = [key for _, _, key, _ in candidates]
    feedback_rows = (
        TemplateSuggestionFeedback.query
        .filter(TemplateSuggestionFeedback.user_id == user_id)
        .filter(TemplateSuggestionFeedback.signature_key.in_(signature_keys))
        .all()
    )
    for row in feedback_rows:
        feedback_by_key[row.signature_key] = row

    ranked: List[Tuple[int, int, int, Dict[str, Any]]] = []
    for text_score, ts, signature_key, payload in candidates:
        feedback_row = feedback_by_key.get(signature_key)
        accepted_count = int(getattr(feedback_row, "accepted_count", 0) or 0)
        rejected_count = int(getattr(feedback_row, "rejected_count", 0) or 0)
        feedback_score = _template_feedback_score(accepted_count, rejected_count)
        payload["feedback"] = {
            "accepted_count": accepted_count,
            "rejected_count": rejected_count,
            "score": feedback_score,
        }
        ranked.append((text_score + feedback_score, text_score, ts, payload))

    ranked.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    return [item[3] for item in ranked[:limit]]
