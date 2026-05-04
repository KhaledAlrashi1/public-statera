"""Budget alert utilities shared by tasks and API routes."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from backend.models import ProductEvent
from backend.money_math import format_kd

BUDGET_ALERT_EVENT_NAME = "budget_alert"
BUDGET_ALERT_DISMISSED_EVENT_NAME = "budget_alert_dismissed"
_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def month_key_for_datetime(now_utc: datetime | None = None) -> str:
    now = now_utc or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return f"{now.year}-{now.month:02d}"


def month_bounds(month_key: str) -> tuple[datetime, datetime]:
    if not _MONTH_RE.fullmatch(month_key or ""):
        raise ValueError("month_key must be YYYY-MM")
    year = int(month_key[:4])
    month = int(month_key[5:7])
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return start, end


def build_budget_alert_key(month_key: str, category_id: int) -> str:
    return f"{month_key}:{int(category_id)}"


def parse_event_properties(properties_json: str | None) -> dict:
    if not properties_json:
        return {}
    try:
        parsed = json.loads(properties_json)
    except Exception:  # noqa: BLE001 - budget-alert side effects are best-effort and should not break primary analytics flows.
        return {}
    return parsed if isinstance(parsed, dict) else {}


def parse_budget_alert_identity(properties_json: str | None) -> tuple[str | None, str | None]:
    props = parse_event_properties(properties_json)
    key = str(props.get("alert_key") or "").strip()
    month = str(props.get("month") or "").strip()

    if not month and key:
        maybe_month = key.split(":", 1)[0]
        if _MONTH_RE.fullmatch(maybe_month):
            month = maybe_month

    if not key and month:
        try:
            category_id = int(props.get("category_id"))
            key = build_budget_alert_key(month, category_id)
        except Exception:  # noqa: BLE001 - budget-alert side effects are best-effort and should not break primary analytics flows.
            key = ""

    if not key or not month or not _MONTH_RE.fullmatch(month):
        return None, None
    return key, month


def load_dismissed_budget_alert_keys(user_id: int, month_key: str) -> set[str]:
    if not user_id:
        return set()
    rows = (
        ProductEvent.query
        .with_entities(ProductEvent.properties_json)
        .filter(ProductEvent.user_id == user_id)
        .filter(ProductEvent.event_name == BUDGET_ALERT_DISMISSED_EVENT_NAME)
        .order_by(ProductEvent.id.desc())
        .limit(1000)
        .all()
    )
    dismissed: set[str] = set()
    for (properties_json,) in rows:
        key, month = parse_budget_alert_identity(properties_json)
        if key and month == month_key:
            dismissed.add(key)
    return dismissed


def list_active_budget_alerts(*, user_id: int, month_key: str, limit: int = 20) -> list[dict]:
    if not user_id:
        return []
    rows = (
        ProductEvent.query
        .filter(ProductEvent.user_id == user_id)
        .filter(
            ProductEvent.event_name.in_(
                [BUDGET_ALERT_EVENT_NAME, BUDGET_ALERT_DISMISSED_EVENT_NAME]
            )
        )
        .order_by(ProductEvent.event_ts.desc(), ProductEvent.id.desc())
        .limit(2000)
        .all()
    )

    dismissed_keys: set[str] = set()
    alerts_by_key: dict[str, dict] = {}

    for row in rows:
        key, event_month = parse_budget_alert_identity(row.properties_json)
        if not key or event_month != month_key:
            continue
        props = parse_event_properties(row.properties_json)
        if row.event_name == BUDGET_ALERT_DISMISSED_EVENT_NAME:
            dismissed_keys.add(key)
            continue
        if row.event_name != BUDGET_ALERT_EVENT_NAME:
            continue
        if key in alerts_by_key:
            continue

        ratio = _safe_float(props.get("ratio"), default=0.0)
        threshold = _safe_float(props.get("threshold"), default=0.9)
        category = str(props.get("category") or "Uncategorized").strip()[:64] or "Uncategorized"
        category_id = _safe_int(props.get("category_id"))
        budget_kd = _safe_money_str(props.get("budget_kd"))
        spent_kd = _safe_money_str(props.get("spent_kd"))

        alerts_by_key[key] = {
            "id": int(row.id),
            "type": BUDGET_ALERT_EVENT_NAME,
            "alert_key": key,
            "month": month_key,
            "category": category,
            "category_id": category_id,
            "budget_kd": budget_kd,
            "spent_kd": spent_kd,
            "ratio": round(ratio, 4),
            "threshold": round(threshold, 4),
            "created_at": row.event_ts.isoformat() if row.event_ts else None,
        }

    items = [alert for key, alert in alerts_by_key.items() if key not in dismissed_keys]
    items.sort(key=lambda x: (float(x.get("ratio") or 0), str(x.get("created_at") or "")), reverse=True)
    return items[: max(1, min(int(limit or 20), 100))]


def collect_month_alert_key_sets(
    month_key: str,
) -> tuple[set[tuple[int, str]], set[tuple[int, str]]]:
    month_start, _month_end = month_bounds(month_key)
    lookup_start = month_start - timedelta(days=120)
    rows = (
        ProductEvent.query
        .with_entities(ProductEvent.user_id, ProductEvent.event_name, ProductEvent.properties_json)
        .filter(
            ProductEvent.event_name.in_(
                [BUDGET_ALERT_EVENT_NAME, BUDGET_ALERT_DISMISSED_EVENT_NAME]
            )
        )
        .filter(ProductEvent.event_ts >= lookup_start)
        .all()
    )

    existing: set[tuple[int, str]] = set()
    dismissed: set[tuple[int, str]] = set()

    for user_id, event_name, properties_json in rows:
        key, event_month = parse_budget_alert_identity(properties_json)
        if not user_id or not key or event_month != month_key:
            continue
        pair = (int(user_id), key)
        if event_name == BUDGET_ALERT_DISMISSED_EVENT_NAME:
            dismissed.add(pair)
        elif event_name == BUDGET_ALERT_EVENT_NAME:
            existing.add(pair)
    return existing, dismissed


def _safe_float(value, *, default: float) -> float:
    try:
        return float(value)
    except Exception:  # noqa: BLE001 - budget-alert side effects are best-effort and should not break primary analytics flows.
        return default


def _safe_int(value) -> int | None:
    try:
        return int(value)
    except Exception:  # noqa: BLE001 - budget-alert side effects are best-effort and should not break primary analytics flows.
        return None


def _safe_money_str(value) -> str:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        amount = Decimal("0")
    return format_kd(amount)
