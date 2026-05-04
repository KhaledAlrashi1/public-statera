"""Product analytics event helpers."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from flask import current_app, has_app_context
from sqlalchemy.exc import OperationalError, ProgrammingError

from backend import db
from backend.models import ProductEvent


def _get_logger() -> logging.Logger:
    if has_app_context():
        return current_app.logger
    return logging.getLogger(__name__)


def _to_json(payload: dict[str, Any] | None) -> str | None:
    if not payload:
        return None
    try:
        return json.dumps(payload, separators=(",", ":"), sort_keys=True)
    except Exception:  # noqa: BLE001 - product-event logging is best-effort and should never fail the main request.
        _get_logger().exception("Failed to serialize product event properties.")
        return None


def has_event(user_id: int, event_name: str) -> bool:
    if not user_id or not event_name:
        return False
    try:
        row = (
            ProductEvent.query
            .with_entities(ProductEvent.id)
            .filter(ProductEvent.user_id == user_id, ProductEvent.event_name == event_name)
            .first()
        )
        return bool(row)
    except (OperationalError, ProgrammingError):
        db.session.rollback()
        _get_logger().warning(
            "Product event lookup failed for user_id=%s event_name=%s",
            user_id,
            event_name,
            exc_info=True,
        )
        return False


def has_event_between(
    user_id: int,
    event_name: str,
    start_ts: datetime | None = None,
    end_ts: datetime | None = None,
) -> bool:
    if not user_id or not event_name:
        return False
    try:
        q = (
            ProductEvent.query
            .with_entities(ProductEvent.id)
            .filter(ProductEvent.user_id == user_id, ProductEvent.event_name == event_name)
        )
        if start_ts is not None:
            q = q.filter(ProductEvent.event_ts >= start_ts)
        if end_ts is not None:
            q = q.filter(ProductEvent.event_ts < end_ts)
        return bool(q.first())
    except (OperationalError, ProgrammingError):
        db.session.rollback()
        _get_logger().warning(
            "Product event range lookup failed for user_id=%s event_name=%s",
            user_id,
            event_name,
            exc_info=True,
        )
        return False


def record_event(
    event_name: str,
    user_id: int,
    properties: dict[str, Any] | None = None,
    *,
    commit: bool = False,
) -> ProductEvent | None:
    if not user_id or not event_name:
        return None

    row = ProductEvent(
        user_id=user_id,
        event_name=event_name[:64],
        properties_json=_to_json(properties),
    )
    try:
        db.session.add(row)
        if commit:
            db.session.commit()
        return row
    except (OperationalError, ProgrammingError):
        db.session.rollback()
        _get_logger().warning(
            "Product event write failed for user_id=%s event_name=%s",
            user_id,
            event_name,
            exc_info=True,
        )
        return None


def record_event_once(
    event_name: str,
    user_id: int,
    properties: dict[str, Any] | None = None,
    *,
    commit: bool = False,
) -> bool:
    if has_event(user_id, event_name):
        return False
    created = record_event(event_name, user_id, properties, commit=commit)
    return created is not None


def record_event_daily(
    event_name: str,
    user_id: int,
    properties: dict[str, Any] | None = None,
    *,
    commit: bool = False,
    now_utc: datetime | None = None,
) -> bool:
    now = now_utc or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    if has_event_between(user_id, event_name, day_start, day_end):
        return False
    created = record_event(event_name, user_id, properties, commit=commit)
    return created is not None
