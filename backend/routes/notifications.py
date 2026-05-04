"""Notification routes (budget alerts)."""

from __future__ import annotations

import re

from flask import Blueprint, request
from flask_login import current_user, login_required

from backend.api_response import error_response, ok_response
from backend.budget_alerts import (
    BUDGET_ALERT_DISMISSED_EVENT_NAME,
    BUDGET_ALERT_EVENT_NAME,
    list_active_budget_alerts,
    load_dismissed_budget_alert_keys,
    month_key_for_datetime,
    parse_budget_alert_identity,
)
from backend.models import ProductEvent
from backend.product_events import record_event

bp = Blueprint("notifications", __name__)
_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


@bp.route("/api/notifications/budget-alerts", methods=["GET"])
@login_required
def api_budget_alerts():
    month = (request.args.get("month") or "").strip()
    if month and not _MONTH_RE.fullmatch(month):
        return error_response("month must be in YYYY-MM format", status=400, code="validation_error")
    if not month:
        month = month_key_for_datetime()

    limit = request.args.get("limit", default=20, type=int)
    if limit is None:
        limit = 20
    if limit < 1 or limit > 100:
        return error_response("limit must be between 1 and 100", status=400, code="validation_error")

    items = list_active_budget_alerts(user_id=current_user.id, month_key=month, limit=limit)
    payload = {"month": month, "items": items}
    return ok_response(data=payload, legacy=payload, meta={"count": len(items)})


@bp.route("/api/notifications/budget-alerts/<int:alert_id>/dismiss", methods=["POST"])
@login_required
def api_dismiss_budget_alert(alert_id: int):
    event = (
        ProductEvent.query
        .filter_by(id=alert_id, user_id=current_user.id, event_name=BUDGET_ALERT_EVENT_NAME)
        .first()
    )
    if not event:
        return error_response("Budget alert not found.", status=404, code="not_found")

    alert_key, month = parse_budget_alert_identity(event.properties_json)
    if not alert_key or not month:
        return error_response("Budget alert is malformed.", status=400, code="invalid_alert")

    dismissed_keys = load_dismissed_budget_alert_keys(current_user.id, month)
    already_dismissed = alert_key in dismissed_keys
    if not already_dismissed:
        record_event(
            BUDGET_ALERT_DISMISSED_EVENT_NAME,
            current_user.id,
            properties={"alert_key": alert_key, "month": month},
            commit=True,
        )

    payload = {
        "dismissed": True,
        "already_dismissed": already_dismissed,
        "alert_id": alert_id,
        "alert_key": alert_key,
        "month": month,
    }
    return ok_response(data=payload, legacy=payload)
