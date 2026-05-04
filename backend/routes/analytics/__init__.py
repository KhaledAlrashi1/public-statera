"""Analytics routes: spend-by-category, spend-by-month, and suggestions."""

from __future__ import annotations

import json
import time
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, current_app, g, request
from flask_login import current_user, login_required
from sqlalchemy.exc import DBAPIError

from backend import db
from backend.api_response import error_response, ok_response
from backend.budget_alerts import list_active_budget_alerts
from backend.constants import RATE_LIMIT_SEARCH
from backend.lib.cache import (
    CacheBackendUnavailableError,
    analytics_cache_circuit_breaker,
    cache_backend_warning,
    cache_get,
    cache_set,
    dashboard_metrics_cache_key,
)
from backend.lib.suggestions import (
    record_template_suggestion_feedback,
    suggest_transaction_templates,
    suggest_transactions,
)
from backend.lib.payday import expense_category_filter_expr
from backend.lib.validation import ValidationError
from backend.models import Category, Transaction, UserProfile
from backend.money_math import format_kd
from backend.routes.budgets import build_budget_payload
from backend.routes.debt import build_debt_summary_payload
from backend.security_ops import rate_limit

from .dashboard import (
    AnalyticsComputationTimeoutError,
    _analytics_timeout_guard,
    _analytics_timeout_seconds,
    _compute_dashboard_metrics_payload,
    _dashboard_snapshot_computed_at,
    _dashboard_snapshot_eligibility,
    _load_dashboard_snapshot_payload,
    _persist_dashboard_snapshot,
    _record_dashboard_open_event,
    rebuild_dashboard_snapshot,
)
from .digest import (
    _build_safe_to_spend_payload,
    _get_safe_to_spend_payload_cached,
    _sum_expense_between,
)
from .income import _build_income_pattern_payload, _build_recurring_patterns_payload
from .overview import (
    _build_account_overview_payload,
    _build_snapshot_payload,
    _build_spending_intelligence_payload,
)
from .shared import (
    _DASHBOARD_CACHE_TTL_SECONDS,
    _MONTH_RE,
    _current_local_date,
    _current_month_key,
    _dashboard_snapshot_months_count,
    _days_until_payday,
    _month_key,
    _parse_bool_query,
    _parse_source_query,
    _rounded_percent,
    _user_timezone,
    _week_bounds,
)
from .spending import (
    _build_budget_metrics_payload,
    _build_expense_breakdown_payload,
    _build_expense_merchant_trend_payload,
    _build_spend_by_category_items,
    _build_spend_by_month_items,
)

try:
    import sentry_sdk
except Exception:  # noqa: BLE001 - Sentry is optional in local and test environments.
    sentry_sdk = None  # type: ignore[assignment]

# USER SCOPING AUDIT — Mar 2026 (see tests/test_multi_user_analytics_isolation.py)
# All queries in this package are scoped to current_user.id. Enforcement pattern:
#   - Route handlers: use current_user.id directly
#   - Helper functions: always accept user_id as explicit parameter
# When adding new queries: ALWAYS include a user_id filter at the Transaction
# or entity level. Never query a user-owned table without a user_id filter.

bp = Blueprint("analytics", __name__)
_ANALYTICS_CACHE_BYPASS_SENTRY_KEY = "_analytics_cache_bypass_sentry_logged"


def _analytics_timeout_response(*, route_name: str):
    try:
        db.session.rollback()
    except Exception:  # noqa: BLE001 - rollback is best-effort after timeout handling.
        pass

    current_app.logger.warning(
        "Analytics computation timed out route=%s user_id=%s",
        route_name,
        getattr(current_user, "id", None),
    )
    return error_response(
        "Analytics are taking longer than expected. Please try again shortly.",
        status=503,
        code="analytics_timeout",
    )


def _analytics_cache_unavailable_response(*, route_name: str):
    try:
        db.session.rollback()
    except Exception:  # noqa: BLE001 - rollback is best-effort after cache failures.
        pass

    warning = _capture_analytics_cache_bypass_warning(route_name)
    current_app.logger.warning(
        "Analytics cache unavailable route=%s user_id=%s warning=%s",
        route_name,
        getattr(current_user, "id", None),
        warning or "redis_unavailable",
    )
    response = error_response(
        "Dashboard analytics are temporarily unavailable while Redis recovers. Please try again shortly.",
        status=503,
        code="analytics_cache_unavailable",
    )
    response.headers["Retry-After"] = str(_analytics_timeout_seconds())
    return response


def _capture_analytics_cache_bypass_warning(route_name: str) -> str | None:
    warning = cache_backend_warning()
    if not warning:
        return None

    already_logged = False
    try:
        already_logged = bool(getattr(g, _ANALYTICS_CACHE_BYPASS_SENTRY_KEY, False))
        if not already_logged:
            setattr(g, _ANALYTICS_CACHE_BYPASS_SENTRY_KEY, True)
    except Exception:  # noqa: BLE001 - request context storage should not block analytics responses.
        already_logged = False

    current_app.logger.warning(
        "Analytics cache bypassed route=%s user_id=%s warning=%s",
        route_name,
        getattr(current_user, "id", None),
        warning,
    )

    if already_logged or sentry_sdk is None:
        return warning

    try:
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("analytics_route", route_name)
            scope.set_tag("analytics_cache_status", "bypassed")
            scope.set_context("analytics_cache", {"warning": warning})
            sentry_sdk.capture_message(
                f"Analytics cache bypassed on {route_name}: {warning}",
                level="warning",
            )
    except Exception:  # noqa: BLE001 - observability failures should never fail the API request.
        pass
    return warning


def _cache_dashboard_payload(cache_key: str, payload: dict[str, object]) -> None:
    cache_set(
        cache_key,
        json.dumps(payload, separators=(",", ":"), ensure_ascii=True),
        ttl_seconds=_DASHBOARD_CACHE_TTL_SECONDS,
    )


def _build_dashboard_bundle_payload(
    user_id: int,
    month: str,
    *,
    current_window_end_month: str,
    today_date: date,
) -> dict[str, object]:
    return {
        "month": month,
        "snapshot_computed_at": _dashboard_snapshot_computed_at(
            user_id=user_id,
            months_count=_dashboard_snapshot_months_count(),
            window_end_month=current_window_end_month,
        ),
        "safe_to_spend": _get_safe_to_spend_payload_cached(
            user_id,
            month,
            today_date=today_date,
        ),
        "debt_summary": build_debt_summary_payload(user_id),
        "budget": build_budget_payload(user_id, month),
        "budget_alerts": {
            "month": month,
            "items": list_active_budget_alerts(user_id=user_id, month_key=month, limit=20),
        },
        "account_overview": _build_account_overview_payload(user_id, month),
    }


@bp.route("/api/spend-by-category")
@login_required
def api_spend_by_category():
    items = _build_spend_by_category_items(current_user.id)
    return ok_response(data={"items": items}, legacy={"items": items}, meta={"count": len(items)})


@bp.route("/api/spend-by-month")
@login_required
def api_spend_by_month():
    items = _build_spend_by_month_items(current_user.id)
    return ok_response(data={"items": items}, legacy={"items": items}, meta={"count": len(items)})


@bp.route("/api/dashboard-metrics")
@login_required
def api_dashboard_metrics():
    months = request.args.get("months", default=24, type=int)
    if months is None:
        months = 24
    if months < 1 or months > 60:
        return error_response("months must be between 1 and 60", status=400, code="validation_error")

    user_tz = _user_timezone(current_user.id)
    current_month = _current_month_key(user_tz)
    cycle_enabled = _parse_bool_query(request.args.get("cycle"))
    until = (request.args.get("until") or "").strip()
    if until and not _MONTH_RE.fullmatch(until):
        return error_response("until must be in YYYY-MM format", status=400, code="validation_error")

    if until:
        end_year, end_month = int(until[:4]), int(until[5:7])
    else:
        end_year, end_month = int(current_month[:4]), int(current_month[5:7])

    cycle_start: date | None = None
    cycle_end: date | None = None
    cache_until = until or current_month
    if cycle_enabled:
        profile = UserProfile.query.filter_by(user_id=current_user.id).first()
        cycle_reference = date(end_year, end_month, 1)
        from backend.lib.payday import current_pay_period

        cycle_start, cycle_end = current_pay_period(
            profile.payday_day if profile else None,
            cycle_reference,
        )
        cache_until = f"{cache_until}|cycle=1|{cycle_start.isoformat()}|{cycle_end.isoformat()}"

    cache_key = dashboard_metrics_cache_key(current_user.id, months, cache_until)
    try:
        with _analytics_timeout_guard(_analytics_timeout_seconds()):
            with analytics_cache_circuit_breaker(
                route_name="dashboard_metrics",
                timeout_seconds=_analytics_timeout_seconds(),
            ):
                cached_payload_raw = cache_get(cache_key)
                if cached_payload_raw:
                    try:
                        cached_payload = json.loads(cached_payload_raw)
                        _record_dashboard_open_event()
                        response = ok_response(
                            data=cached_payload,
                            legacy=cached_payload,
                            meta={"months_count": len(cached_payload.get("months", []))},
                        )
                        response.headers["X-Cache-Status"] = "hit"
                        return response
                    except Exception:  # noqa: BLE001 - corrupted cache entries should trigger recomputation.
                        current_app.logger.warning(
                            "Invalid cached dashboard metrics payload for key=%s; recomputing.",
                            cache_key,
                            exc_info=True,
                        )

                snapshot_eligible, window_end_month = _dashboard_snapshot_eligibility(
                    months=months,
                    end_year=end_year,
                    end_month=end_month,
                    cycle_enabled=cycle_enabled,
                    current_month_key=current_month,
                )
                if snapshot_eligible:
                    snapshot_payload = _load_dashboard_snapshot_payload(
                        user_id=current_user.id,
                        months_count=months,
                        window_end_month=window_end_month,
                    )
                    if snapshot_payload is not None:
                        _cache_dashboard_payload(cache_key, snapshot_payload)
                        cache_warning = _capture_analytics_cache_bypass_warning("dashboard_metrics")
                        if cache_warning:
                            snapshot_payload = {**snapshot_payload, "cache_warning": cache_warning}
                        _record_dashboard_open_event()
                        response = ok_response(
                            data=snapshot_payload,
                            legacy=snapshot_payload,
                            meta={"months_count": len(snapshot_payload.get("months", []))},
                        )
                        response.headers["X-Cache-Status"] = "snapshot"
                        return response

                payload = _compute_dashboard_metrics_payload(
                    user_id=current_user.id,
                    months=months,
                    end_year=end_year,
                    end_month=end_month,
                    cycle_enabled=cycle_enabled,
                    cycle_start=cycle_start,
                    cycle_end=cycle_end,
                )
                payload["updated_at"] = datetime.now(timezone.utc).isoformat()

                if snapshot_eligible:
                    try:
                        _persist_dashboard_snapshot(
                            user_id=current_user.id,
                            months_count=months,
                            window_end_month=window_end_month,
                            payload=payload,
                        )
                    except Exception:  # noqa: BLE001 - snapshot persistence should not block live analytics responses.
                        db.session.rollback()
                        current_app.logger.exception(
                            "Failed to persist dashboard snapshot for user_id=%s window_end_month=%s",
                            current_user.id,
                            window_end_month,
                        )

                _cache_dashboard_payload(cache_key, payload)
    except CacheBackendUnavailableError:
        return _analytics_cache_unavailable_response(route_name="dashboard_metrics")
    except AnalyticsComputationTimeoutError:
        return _analytics_timeout_response(route_name="dashboard_metrics")

    payload["cache_warning"] = _capture_analytics_cache_bypass_warning("dashboard_metrics")
    _record_dashboard_open_event()
    response = ok_response(
        data=payload,
        legacy=payload,
        meta={"months_count": len(payload.get("months", []))},
    )
    response.headers["X-Cache-Status"] = "miss"
    return response


@bp.route("/api/analytics/account-overview")
@login_required
def api_account_overview():
    month = (request.args.get("month") or "").strip()
    if not month:
        month = _current_month_key(_user_timezone(current_user.id))
    elif not _MONTH_RE.fullmatch(month):
        return error_response("month must be in YYYY-MM format", status=400, code="validation_error")

    payload = _build_account_overview_payload(current_user.id, month)
    return ok_response(
        data=payload,
        legacy=payload,
        meta={"connected_accounts_count": len(payload.get("connected_accounts") or [])},
    )


@bp.route("/api/expense-breakdown")
@login_required
def api_expense_breakdown():
    dimension = (request.args.get("dimension") or "category").strip().lower()
    range_key = (request.args.get("range") or "month").strip().lower()
    month = (request.args.get("month") or "").strip()
    limit = request.args.get("limit", default=500, type=int)
    if limit is None:
        limit = 500
    source_raw = (request.args.get("source") or "").strip()

    if dimension not in {"category", "merchant", "transaction"}:
        return error_response(
            "dimension must be one of: category, merchant, transaction",
            status=400,
            code="validation_error",
        )
    if range_key not in {"month", "12m", "all"}:
        return error_response("range must be one of: month, 12m, all", status=400, code="validation_error")
    if limit < 1 or limit > 1000:
        return error_response("limit must be between 1 and 1000", status=400, code="validation_error")

    try:
        source = _parse_source_query(source_raw)
    except ValidationError as err:
        return error_response(str(err), status=400, code="validation_error")

    if not month:
        month = _current_month_key(_user_timezone(current_user.id))
    elif not _MONTH_RE.fullmatch(month):
        return error_response("month must be in YYYY-MM format", status=400, code="validation_error")

    payload = _build_expense_breakdown_payload(
        user_id=current_user.id,
        dimension=dimension,
        range_key=range_key,
        month=month,
        limit=limit,
        source=source,
    )
    return ok_response(data=payload, legacy=payload, meta={"count": len(payload["items"])})


@bp.route("/api/expense-merchant-trend")
@login_required
def api_expense_merchant_trend():
    merchant = (request.args.get("merchant") or "").strip()
    months = request.args.get("months", default=12, type=int)
    if months is None:
        months = 12
    until = (request.args.get("until") or "").strip()

    if not merchant:
        return error_response("merchant is required", status=400, code="validation_error")
    if months < 1 or months > 24:
        return error_response("months must be between 1 and 24", status=400, code="validation_error")
    if until and not _MONTH_RE.fullmatch(until):
        return error_response("until must be in YYYY-MM format", status=400, code="validation_error")

    current_month = _current_month_key(_user_timezone(current_user.id))
    payload = _build_expense_merchant_trend_payload(
        user_id=current_user.id,
        merchant=merchant,
        months=months,
        until=until or None,
        current_month=current_month,
    )
    return ok_response(data=payload, legacy=payload, meta={"count": len(payload["series"])})


@bp.route("/api/budget-metrics")
@login_required
def api_budget_metrics():
    user_tz = _user_timezone(current_user.id)
    today_date = _current_local_date(user_tz)
    month = (request.args.get("month") or "").strip()
    range_key = (request.args.get("range") or "month").strip().lower()
    cycle_enabled = _parse_bool_query(request.args.get("cycle"))

    if not month:
        month = _current_month_key(user_tz)
    elif not _MONTH_RE.fullmatch(month):
        return error_response("month must be in YYYY-MM format", status=400, code="validation_error")
    if range_key not in {"month", "30", "90", "365", "all"}:
        return error_response("range must be one of: month, 30, 90, 365, all", status=400, code="validation_error")

    payload = _build_budget_metrics_payload(
        user_id=current_user.id,
        month=month,
        range_key=range_key,
        cycle_enabled=cycle_enabled,
        today_date=today_date,
    )
    return ok_response(data=payload, legacy=payload)


@bp.route("/api/dashboard-bundle")
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_dashboard_bundle():
    user_tz = _user_timezone(current_user.id)
    current_month = _current_month_key(user_tz)
    today_date = _current_local_date(user_tz)
    month = (request.args.get("month") or "").strip()
    if not month:
        month = current_month
    elif not _MONTH_RE.fullmatch(month):
        return error_response("month must be in YYYY-MM format", status=400, code="validation_error")

    try:
        with _analytics_timeout_guard(_analytics_timeout_seconds()):
            with analytics_cache_circuit_breaker(
                route_name="dashboard_bundle",
                timeout_seconds=_analytics_timeout_seconds(),
            ):
                payload = _build_dashboard_bundle_payload(
                    current_user.id,
                    month,
                    current_window_end_month=current_month,
                    today_date=today_date,
                )
    except CacheBackendUnavailableError:
        return _analytics_cache_unavailable_response(route_name="dashboard_bundle")
    except AnalyticsComputationTimeoutError:
        return _analytics_timeout_response(route_name="dashboard_bundle")
    except DBAPIError as exc:
        if exc.__cause__ is not None or exc.orig is not None:
            from .dashboard import _is_statement_timeout_error

            if _is_statement_timeout_error(exc):
                return _analytics_timeout_response(route_name="dashboard_bundle")
        raise

    _capture_analytics_cache_bypass_warning("dashboard_bundle")
    return ok_response(
        data=payload,
        legacy=payload,
        meta={
            "budget_count": len((payload.get("budget") or {}).get("items") or []),
            "alert_count": len((payload.get("budget_alerts") or {}).get("items") or []),
        },
    )


@bp.route("/api/safe-to-spend")
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_safe_to_spend():
    started = time.perf_counter()
    user_tz = _user_timezone(current_user.id)
    today_date = _current_local_date(user_tz)
    month = (request.args.get("month") or "").strip()
    if not month:
        month = _current_month_key(user_tz)
    elif not _MONTH_RE.fullmatch(month):
        return error_response("month must be in YYYY-MM format", status=400, code="validation_error")

    try:
        with _analytics_timeout_guard(_analytics_timeout_seconds()):
            with analytics_cache_circuit_breaker(
                route_name="safe_to_spend",
                timeout_seconds=_analytics_timeout_seconds(),
            ):
                payload = _get_safe_to_spend_payload_cached(
                    current_user.id,
                    month,
                    today_date=today_date,
                    tz=user_tz,
                )
    except CacheBackendUnavailableError:
        return _analytics_cache_unavailable_response(route_name="safe_to_spend")
    except AnalyticsComputationTimeoutError:
        return _analytics_timeout_response(route_name="safe_to_spend")

    _capture_analytics_cache_bypass_warning("safe_to_spend")
    duration_ms = int((time.perf_counter() - started) * 1000)
    current_app.logger.info(
        "safe_to_spend computed user_id=%s month=%s duration_ms=%s data_complete=%s",
        current_user.id,
        month,
        duration_ms,
        bool(payload.get("data_complete")),
    )
    return ok_response(data=payload, legacy=payload)


@bp.route("/api/weekly-digest")
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_weekly_digest():
    user_tz = _user_timezone(current_user.id)
    today_date = _current_local_date(user_tz)
    week_start, week_end = _week_bounds(today_date)
    this_week_effective_end = min(today_date, week_end)
    last_week_start = week_start - timedelta(days=7)
    last_week_end = week_start - timedelta(days=1)

    this_week_expense = _sum_expense_between(current_user.id, week_start, this_week_effective_end)
    last_week_expense = _sum_expense_between(current_user.id, last_week_start, last_week_end)
    if last_week_expense > 0:
        delta_pct = _rounded_percent(this_week_expense - last_week_expense, last_week_expense)
    elif this_week_expense > 0:
        delta_pct = 100.0
    else:
        delta_pct = 0.0

    top_rows = (
        db.session.query(
            db.func.coalesce(Category.name, "Uncategorized").label("name"),
            db.func.sum(Transaction.amount_kd).label("total"),
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == current_user.id)
        .filter(Transaction.date >= week_start)
        .filter(Transaction.date <= this_week_effective_end)
        .filter(expense_category_filter_expr(Category.name, Category.is_income))
        .group_by(db.func.coalesce(Category.name, "Uncategorized"))
        .order_by(db.func.sum(Transaction.amount_kd).desc(), db.func.coalesce(Category.name, "Uncategorized").asc())
        .limit(3)
        .all()
    )
    top_categories = [
        {"name": str(name or "Uncategorized"), "amount_kd": format_kd(total or 0)}
        for name, total in top_rows
    ]

    profile = UserProfile.query.filter_by(user_id=current_user.id).first()
    safe_to_spend_payload = _get_safe_to_spend_payload_cached(
        current_user.id,
        _month_key(today_date),
        today_date=today_date,
        tz=user_tz,
    )
    payload = {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "this_week_expense_kd": format_kd(this_week_expense),
        "last_week_expense_kd": format_kd(last_week_expense),
        "delta_pct": delta_pct,
        "top_categories": top_categories,
        "days_until_payday": _days_until_payday(today_date, profile.payday_day if profile else None),
        "safe_to_spend_today_kd": str(safe_to_spend_payload.get("daily_rate_kd") or "0.000"),
        "days_observed": (this_week_effective_end - week_start).days + 1,
    }
    return ok_response(data=payload, legacy=payload, meta={"count": len(top_categories)})


@bp.route("/api/income-pattern")
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_income_pattern():
    user_tz = _user_timezone(current_user.id)
    today_date = _current_local_date(user_tz)
    payload = _build_income_pattern_payload(
        user_id=current_user.id,
        current_month=_current_month_key(user_tz),
        today_date=today_date,
        tz=user_tz,
    )
    return ok_response(data=payload, legacy=payload)


@bp.route("/api/recurring-patterns")
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_recurring_patterns():
    if not current_app.config.get("ENABLE_RECURRING_PATTERNS", True):
        return ok_response(data={"patterns": []}, legacy={"patterns": []}, meta={"count": 0, "enabled": False})

    days = request.args.get("days", default=90, type=int)
    if days is None:
        days = 90
    if days < 30 or days > 365:
        return error_response("days must be between 30 and 365", status=400, code="validation_error")

    user_tz = _user_timezone(current_user.id)
    payload = _build_recurring_patterns_payload(
        user_id=current_user.id,
        days=days,
        today_date=_current_local_date(user_tz),
        tz=user_tz,
    )
    return ok_response(data=payload, legacy=payload, meta={"count": len(payload["patterns"]), "days": days})


@bp.route("/api/transaction-suggestions")
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_transaction_suggestions():
    query = (request.args.get("q") or "").strip()
    limit = request.args.get("limit", default=10, type=int)
    items = suggest_transactions(query, current_user.id, limit=limit) if query else []
    return ok_response(data={"items": items}, legacy={"items": items}, meta={"count": len(items)})


@bp.route("/api/transaction-template-suggestions")
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_transaction_template_suggestions():
    if not current_app.config.get("ENABLE_TEMPLATE_SUGGESTIONS", False):
        return ok_response(data={"items": []}, legacy={"items": []}, meta={"count": 0})

    query = (request.args.get("q") or "").strip()
    limit = request.args.get("limit", default=3, type=int)
    items = suggest_transaction_templates(query, current_user.id, limit=limit) if query else []
    return ok_response(data={"items": items}, legacy={"items": items}, meta={"count": len(items)})


@bp.route("/api/transaction-template-suggestions/feedback", methods=["POST"])
@rate_limit(RATE_LIMIT_SEARCH)
@login_required
def api_transaction_template_suggestions_feedback():
    payload = request.get_json(silent=True) or {}
    feedback_key = str(payload.get("feedback_key") or "").strip().lower()
    outcome = str(payload.get("outcome") or "").strip().lower()

    if not feedback_key:
        return error_response("feedback_key is required.", status=400, code="validation_error")
    if outcome not in {"accepted", "rejected"}:
        return error_response("outcome must be either 'accepted' or 'rejected'.", status=400, code="validation_error")

    try:
        feedback = record_template_suggestion_feedback(
            user_id=current_user.id,
            feedback_key=feedback_key,
            outcome=outcome,
        )
        db.session.commit()
        return ok_response(data={"feedback": feedback}, legacy={"feedback": feedback})
    except ValidationError as err:
        db.session.rollback()
        return error_response(str(err), status=400, code="validation_error")
    except Exception:  # noqa: BLE001 - unexpected feedback persistence failures return a generic API error.
        db.session.rollback()
        current_app.logger.exception(
            "Template suggestion feedback save failed for user_id=%s",
            current_user.id,
        )
        return error_response("Failed to save suggestion feedback.", status=500, code="internal_error")


@bp.route("/api/snapshot")
@login_required
def api_snapshot():
    user_tz = _user_timezone(current_user.id)
    return ok_response(data=_build_snapshot_payload(current_user.id, today_date=_current_local_date(user_tz)))


@bp.route("/api/spending-intelligence")
@login_required
def api_spending_intelligence():
    user_tz = _user_timezone(current_user.id)
    today_date = _current_local_date(user_tz)
    month_raw = (request.args.get("month") or "").strip()
    if month_raw and not _MONTH_RE.fullmatch(month_raw):
        return error_response("month must be in YYYY-MM format", status=400, code="validation_error")

    if month_raw:
        ref_year, ref_month = int(month_raw[:4]), int(month_raw[5:7])
    else:
        current_month = _current_month_key(user_tz)
        ref_year, ref_month = int(current_month[:4]), int(current_month[5:7])

    payload = _build_spending_intelligence_payload(
        current_user.id,
        ref_year=ref_year,
        ref_month=ref_month,
        today_date=today_date,
    )
    return ok_response(data=payload)
