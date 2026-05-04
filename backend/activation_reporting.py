"""Activation funnel reporting built from ProductEvent data."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
import json
from pathlib import Path
from statistics import median
from typing import Any

from sqlalchemy import func

from backend import db
from backend.lib.demo_data import DEMO_REPLACED_WITH_IMPORT_EVENT
from backend.models import ProductEvent, User


ACTIVATION_EVENTS = (
    "demo_data_loaded",
    "import_completed",
    "bank.connected",
)

FUNNEL_EVENTS = (
    "signup_completed",
    "app_opened",
    "first_budget_set",
    *ACTIVATION_EVENTS,
)

REPORT_EVENTS = (
    *FUNNEL_EVENTS,
    DEMO_REPLACED_WITH_IMPORT_EVENT,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_now(now: datetime | None) -> datetime:
    value = now or _utc_now()
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _window_bounds(days: int, now: datetime | None = None) -> tuple[datetime, datetime, datetime]:
    resolved_days = max(1, int(days))
    as_of = _normalize_now(now)
    end_day = as_of.date()
    start_day = end_day - timedelta(days=resolved_days - 1)
    start = datetime.combine(start_day, time.min, tzinfo=timezone.utc)
    end_exclusive = datetime.combine(end_day + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return start, end_exclusive, as_of


def _distinct_event_user_counts(start: datetime, end_exclusive: datetime) -> dict[str, int]:
    rows = (
        db.session.query(
            ProductEvent.event_name,
            func.count(func.distinct(ProductEvent.user_id)),
        )
        .filter(ProductEvent.event_ts >= start, ProductEvent.event_ts < end_exclusive)
        .filter(ProductEvent.event_name.in_(REPORT_EVENTS))
        .group_by(ProductEvent.event_name)
        .all()
    )
    return {event_name: int(count or 0) for event_name, count in rows}


def _daily_user_signups(start: datetime, end_exclusive: datetime) -> dict[date, int]:
    rows = (
        db.session.query(
            func.date_trunc("day", User.created_at).label("day_bucket"),
            func.count(User.id),
        )
        .filter(User.created_at >= start, User.created_at < end_exclusive)
        .group_by("day_bucket")
        .order_by("day_bucket")
        .all()
    )
    return {
        day_bucket.date(): int(count or 0)
        for day_bucket, count in rows
        if day_bucket is not None
    }


def _daily_event_users(start: datetime, end_exclusive: datetime) -> dict[date, dict[str, int]]:
    rows = (
        db.session.query(
            func.date_trunc("day", ProductEvent.event_ts).label("day_bucket"),
            ProductEvent.event_name,
            func.count(func.distinct(ProductEvent.user_id)),
        )
        .filter(ProductEvent.event_ts >= start, ProductEvent.event_ts < end_exclusive)
        .filter(ProductEvent.event_name.in_(REPORT_EVENTS))
        .group_by("day_bucket", ProductEvent.event_name)
        .order_by("day_bucket", ProductEvent.event_name)
        .all()
    )
    daily: dict[date, dict[str, int]] = defaultdict(dict)
    for day_bucket, event_name, count in rows:
        if day_bucket is None or not event_name:
            continue
        daily[day_bucket.date()][event_name] = int(count or 0)
    return daily


def _daily_activated_users(start: datetime, end_exclusive: datetime) -> dict[date, int]:
    rows = (
        db.session.query(
            func.date_trunc("day", ProductEvent.event_ts).label("day_bucket"),
            func.count(func.distinct(ProductEvent.user_id)),
        )
        .filter(ProductEvent.event_ts >= start, ProductEvent.event_ts < end_exclusive)
        .filter(ProductEvent.event_name.in_(ACTIVATION_EVENTS))
        .group_by("day_bucket")
        .order_by("day_bucket")
        .all()
    )
    return {
        day_bucket.date(): int(count or 0)
        for day_bucket, count in rows
        if day_bucket is not None
    }


def _activation_time_hours(start: datetime, end_exclusive: datetime) -> list[float]:
    signup_rows = (
        db.session.query(
            ProductEvent.user_id,
            func.min(ProductEvent.event_ts).label("signup_ts"),
        )
        .filter(ProductEvent.event_ts >= start, ProductEvent.event_ts < end_exclusive)
        .filter(ProductEvent.event_name == "signup_completed")
        .group_by(ProductEvent.user_id)
        .all()
    )
    first_activation_rows = (
        db.session.query(
            ProductEvent.user_id,
            func.min(ProductEvent.event_ts).label("activation_ts"),
        )
        .filter(ProductEvent.event_ts >= start, ProductEvent.event_ts < end_exclusive)
        .filter(ProductEvent.event_name.in_(ACTIVATION_EVENTS))
        .group_by(ProductEvent.user_id)
        .all()
    )
    activation_by_user = {
        user_id: activation_ts
        for user_id, activation_ts in first_activation_rows
        if user_id and activation_ts is not None
    }
    deltas: list[float] = []
    for user_id, signup_ts in signup_rows:
        activation_ts = activation_by_user.get(user_id)
        if signup_ts is None or activation_ts is None or activation_ts < signup_ts:
            continue
        deltas.append(round((activation_ts - signup_ts).total_seconds() / 3600, 2))
    return deltas


def _users_with_event(
    event_name: str,
    start: datetime,
    end_exclusive: datetime,
) -> set[int]:
    rows = (
        db.session.query(ProductEvent.user_id)
        .filter(ProductEvent.event_ts >= start, ProductEvent.event_ts < end_exclusive)
        .filter(ProductEvent.event_name == event_name)
        .distinct()
        .all()
    )
    return {int(user_id) for (user_id,) in rows if user_id}


def build_activation_report(days: int = 30, now: datetime | None = None) -> dict[str, Any]:
    start, end_exclusive, as_of = _window_bounds(days, now=now)
    distinct_counts = _distinct_event_user_counts(start, end_exclusive)
    users_created = int(
        db.session.query(func.count(User.id))
        .filter(User.created_at >= start, User.created_at < end_exclusive)
        .scalar()
        or 0
    )
    activated_users = int(
        db.session.query(func.count(func.distinct(ProductEvent.user_id)))
        .filter(ProductEvent.event_ts >= start, ProductEvent.event_ts < end_exclusive)
        .filter(ProductEvent.event_name.in_(ACTIVATION_EVENTS))
        .scalar()
        or 0
    )
    signup_completed = int(distinct_counts.get("signup_completed", 0))
    budget_users = int(distinct_counts.get("first_budget_set", 0))
    activation_hours = _activation_time_hours(start, end_exclusive)
    demo_users = _users_with_event("demo_data_loaded", start, end_exclusive)
    import_users = _users_with_event("import_completed", start, end_exclusive)
    bank_users = _users_with_event("bank.connected", start, end_exclusive)
    demo_replace_import_users = _users_with_event(DEMO_REPLACED_WITH_IMPORT_EVENT, start, end_exclusive)
    daily_signups = _daily_user_signups(start, end_exclusive)
    daily_events = _daily_event_users(start, end_exclusive)
    daily_activated = _daily_activated_users(start, end_exclusive)

    def pct(numerator: int, denominator: int) -> float | None:
        if denominator <= 0:
            return None
        return round((float(numerator) / float(denominator)) * 100.0, 1)

    daily: list[dict[str, Any]] = []
    cursor = start.date()
    last_day = (end_exclusive - timedelta(days=1)).date()
    while cursor <= last_day:
        event_counts = daily_events.get(cursor, {})
        daily.append(
            {
                "date": cursor.isoformat(),
                "users_created": int(daily_signups.get(cursor, 0)),
                "signup_completed": int(event_counts.get("signup_completed", 0)),
                "app_opened": int(event_counts.get("app_opened", 0)),
                "first_budget_set": int(event_counts.get("first_budget_set", 0)),
                "demo_data_loaded": int(event_counts.get("demo_data_loaded", 0)),
                "import_completed": int(event_counts.get("import_completed", 0)),
                "bank_connected": int(event_counts.get("bank.connected", 0)),
                "demo_replaced_with_import": int(event_counts.get(DEMO_REPLACED_WITH_IMPORT_EVENT, 0)),
                "activated_any": int(daily_activated.get(cursor, 0)),
            }
        )
        cursor += timedelta(days=1)

    return {
        "window": {
            "days": max(1, int(days)),
            "start": start.isoformat(),
            "end_exclusive": end_exclusive.isoformat(),
            "as_of": as_of.isoformat(),
        },
        "summary": {
            "users_created": users_created,
            "signup_completed": signup_completed,
            "app_opened": int(distinct_counts.get("app_opened", 0)),
            "first_budget_set": budget_users,
            "activated_any": activated_users,
            "activation_rate_from_signup_pct": pct(activated_users, signup_completed),
            "budget_rate_from_signup_pct": pct(budget_users, signup_completed),
            "median_hours_signup_to_activation": (
                round(float(median(activation_hours)), 2) if activation_hours else None
            ),
            "demo_to_import_users": (
                len(demo_replace_import_users)
                if demo_replace_import_users
                else len(demo_users & import_users)
            ),
        },
        "activation_paths": {
            "demo_data_loaded": len(demo_users),
            "import_completed": len(import_users),
            "bank_connected": len(bank_users),
            "demo_replaced_with_import": len(demo_replace_import_users),
        },
        "daily": daily,
    }


def activation_report_json(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2, sort_keys=True)


def write_activation_report_artifact(path: str | Path, report: dict[str, Any]) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(activation_report_json(report) + "\n", encoding="utf-8")
    return output_path
