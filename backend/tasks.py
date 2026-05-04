"""Periodic maintenance tasks executed by Celery workers."""

from __future__ import annotations

import os
import traceback
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from functools import wraps
from pathlib import Path

from celery.signals import task_failure, task_postrun, task_prerun
from flask import current_app, has_app_context
from sqlalchemy.sql import func

from backend import db
from backend.budget_alerts import (
    BUDGET_ALERT_EVENT_NAME,
    build_budget_alert_key,
    collect_month_alert_key_sets,
    month_key_for_datetime,
)
from backend.db_compat import month_bucket
from backend.email_service import send_templated_email
from backend.lib.account_deletion import purge_user_account_rows
from backend.lib.payday import expense_category_filter_expr
from backend.money_math import format_kd
from backend.product_events import record_event
from backend.worker_health import (
    mark_worker_task_finished,
    mark_worker_task_started,
    should_track_worker_task,
)
from backend.worker import _flask_app, celery_app

try:
    import redis as redis_lib
except Exception:  # pragma: no cover - Celery is optional in web-only or test runtimes.
    redis_lib = None  # type: ignore[assignment]

try:
    import sentry_sdk
except Exception:  # pragma: no cover - Sentry task instrumentation is optional outside worker runtimes.
    sentry_sdk = None  # type: ignore[assignment]

# Task idempotency audit:
# - All beat-scheduled tasks are risky without a lock because duplicate beat firing
#   can run the same task more than once per interval.
# - Redis lock is now applied to every task below.
TASK_IDEMPOTENCY_AUDIT = {
    "delete_account_data": "risky_without_lock",
    "cleanup_rate_limiter": "risky_without_lock",
    "cleanup_account_tokens": "risky_without_lock",
    "cleanup_security_data": "risky_without_lock",
    "cleanup_product_events": "risky_without_lock",
    "cleanup_memorized_transactions": "risky_without_lock",
    "rebuild_dashboard_snapshots": "risky_without_lock",
    "generate_activation_report_artifact": "risky_without_lock",
    "check_budget_alerts": "risky_without_lock",
    "check_expiring_consents": "risky_without_lock",
    "cleanup_abandoned_bank_previews": "risky_without_lock",
    "cleanup_committed_bank_raw_rows": "risky_without_lock",
}


def beat_task_lock(lock_timeout_seconds: int = 300):
    """Prevent duplicate Beat-triggered task execution across Beat instances."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            app = current_app if has_app_context() else _flask_app()
            if redis_lib is None:
                app.logger.warning(
                    "[beat_task_lock] Redis client unavailable for %s; running without Beat lock.",
                    fn.__name__,
                )
                return fn(*args, **kwargs)

            lock_key = f"beat_task_lock:{fn.__name__}"
            redis_client = None
            acquired = False
            try:
                redis_url = app.config.get("REDIS_URL")
                if not redis_url:
                    raise RuntimeError("REDIS_URL is not configured")
                redis_client = redis_lib.from_url(redis_url)
                acquired = bool(
                    redis_client.set(
                        lock_key,
                        "1",
                        nx=True,
                        ex=max(1, int(lock_timeout_seconds)),
                    )
                )
                if not acquired:
                    app.logger.warning(
                        "[beat_task_lock] Skipping %s: lock held by another instance",
                        fn.__name__,
                    )
                    return {"status": "skipped", "reason": "beat_lock_held"}
                return fn(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
                app.logger.error(
                    "[beat_task_lock] Redis unavailable for %s: %s. Running without lock.",
                    fn.__name__,
                    exc,
                )
                return fn(*args, **kwargs)
            finally:
                if acquired and redis_client is not None:
                    try:
                        redis_client.delete(lock_key)
                    except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
                        pass

        return wrapper

    return decorator


def _tracked_task_name(*, sender=None, task=None) -> str:
    if task is not None and getattr(task, "name", None):
        return str(task.name)
    if sender is not None:
        if isinstance(sender, str):
            return sender
        if getattr(sender, "name", None):
            return str(sender.name)
    return ""


def _worker_task_traceback_text(*, exception=None, einfo=None) -> str | None:
    raw_traceback = getattr(einfo, "traceback", None)
    if raw_traceback:
        text = str(raw_traceback).strip()
        return text[:8000] or None

    tb = getattr(exception, "__traceback__", None)
    if exception is None or tb is None:
        return None

    try:
        text = "".join(traceback.format_exception(type(exception), exception, tb)).strip()
    except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        return None
    return text[:8000] or None


@task_prerun.connect(weak=False)
def _record_worker_task_start(task_id=None, task=None, sender=None, **_kwargs) -> None:
    task_name = _tracked_task_name(sender=sender, task=task)
    if not should_track_worker_task(task_name):
        return

    try:
        with _flask_app().app_context():
            mark_worker_task_started(task_name)
    except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        pass


@task_postrun.connect(weak=False)
def _record_worker_task_success(task_id=None, task=None, sender=None, retval=None, state=None, **_kwargs) -> None:
    if state != "SUCCESS":
        return

    task_name = _tracked_task_name(sender=sender, task=task)
    if not should_track_worker_task(task_name):
        return

    status = "success"
    if isinstance(retval, dict):
        raw_status = str(retval.get("status") or "").strip().lower()
        if raw_status:
            status = raw_status[:32]

    try:
        with _flask_app().app_context():
            mark_worker_task_finished(task_name, status=status)
    except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        pass


@task_failure.connect(weak=False)
def _record_worker_task_failure(
    task_id=None,
    exception=None,
    sender=None,
    task=None,
    args=None,
    kwargs=None,
    einfo=None,
    **_extra,
) -> None:
    task_name = _tracked_task_name(sender=sender, task=task)
    if should_track_worker_task(task_name):
        error_text = str(exception or "Task failed.")[:255]
        try:
            with _flask_app().app_context():
                mark_worker_task_finished(task_name, status="failed", error=error_text)
        except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
            pass

    if sentry_sdk is None or exception is None:
        return

    traceback_text = _worker_task_traceback_text(exception=exception, einfo=einfo)
    try:
        _flask_app()
    except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        pass

    try:
        with sentry_sdk.push_scope() as scope:
            if task_name:
                scope.set_tag("celery_task", task_name)
            context = {}
            if task_name:
                context["task_name"] = task_name
            if task_id:
                context["task_id"] = str(task_id)
            if context:
                scope.set_context("celery_task", context)
            if traceback_text:
                scope.set_extra("celery_traceback", traceback_text)
            sentry_sdk.capture_exception(exception)
    except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        pass


def _enqueue_task(task, **kwargs) -> None:
    app = current_app if has_app_context() else _flask_app()
    try:
        task.delay(**kwargs)
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        app.logger.warning(
            "Failed to enqueue task %s kwargs=%s error=%s",
            getattr(task, "name", str(task)),
            kwargs,
            exc,
        )


def _email_recipient_for_user(user_id: int) -> str | None:
    from backend.models import User, UserProfile

    uid = int(user_id or 0)
    if uid <= 0:
        return None
    user = db.session.get(User, uid)
    if not user or not user.email:
        return None

    profile = UserProfile.query.filter_by(user_id=uid).first()
    if profile is not None and not bool(profile.email_notifications_enabled):
        return None
    return str(user.email).strip().lower() or None


def _schedule_seconds(env_name: str, default: int) -> int:
    raw = os.getenv(env_name, str(default))
    try:
        parsed = int(raw)
    except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        return default
    return parsed if parsed > 0 else default


def _period_key_for_interval(now_utc: datetime, interval_seconds: int) -> str:
    bucket = int(now_utc.timestamp()) // max(1, interval_seconds)
    return f"slot:{bucket}"


def _task_lock_ttl_seconds(interval_seconds: int) -> int:
    return max(1, int(interval_seconds * 0.9))


def _acquire_task_lock(task_name: str, *, period_key: str, ttl_seconds: int) -> bool:
    app = current_app if has_app_context() else _flask_app()
    try:
        from backend.security_ops import _rate_limiter

        redis_client = _rate_limiter._get_redis_client()
        lock_key = f"task_lock:{task_name}:{period_key}"
        return bool(redis_client.set(lock_key, "1", nx=True, ex=ttl_seconds))
    except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        app.logger.warning(
            "Task lock unavailable; running without Redis task lock for %s",
            task_name,
        )
        return True


def _acquire_interval_task_lock(
    task_name: str,
    *,
    env_name: str,
    default_interval: int,
    now_utc: datetime | None = None,
) -> tuple[bool, str]:
    now = now_utc or datetime.now(timezone.utc)
    interval = _schedule_seconds(env_name, default_interval)
    period_key = _period_key_for_interval(now, interval)
    ttl_seconds = _task_lock_ttl_seconds(interval)
    acquired = _acquire_task_lock(task_name, period_key=period_key, ttl_seconds=ttl_seconds)
    return acquired, period_key


def _acquire_daily_task_lock(task_name: str, *, now_utc: datetime | None = None) -> tuple[bool, str]:
    now = now_utc or datetime.now(timezone.utc)
    period_key = now.strftime("%Y-%m-%d")
    ttl_seconds = _task_lock_ttl_seconds(24 * 60 * 60)
    acquired = _acquire_task_lock(task_name, period_key=period_key, ttl_seconds=ttl_seconds)
    return acquired, period_key


def execute_cleanup_rate_limiter() -> None:
    """Prune stale rate limiter state."""
    from backend.security_ops import _rate_limiter

    _rate_limiter.cleanup()


def execute_cleanup_account_tokens() -> tuple[int, int]:
    """Delete expired and consumed account-action tokens."""
    from backend.routes.auth import cleanup_account_action_tokens

    return cleanup_account_action_tokens()


def execute_cleanup_security_data(
    *,
    security_events_days: int,
    ingested_messages_days: int,
) -> tuple[int, int]:
    """Prune old security events and ingested messages."""
    from backend.security_ops import cleanup_security_data as _cleanup

    return _cleanup(
        security_events_days=security_events_days,
        ingested_messages_days=ingested_messages_days,
    )


def execute_cleanup_product_events(*, product_events_days: int) -> int:
    """Prune old product event rows."""
    from backend.security_ops import cleanup_product_events as _cleanup

    return _cleanup(product_events_days=product_events_days)


def execute_cleanup_memorized_transactions() -> int:
    """Prune stale memorized transactions."""
    from backend.lib.suggestions import prune_all_stale_memorized_transactions

    return prune_all_stale_memorized_transactions()


def execute_rebuild_dashboard_snapshots(*, months_count: int) -> dict[str, int | str]:
    """Rebuild persisted dashboard snapshots for all active users."""
    from backend.lib.cache import cache_bust_dashboard_metrics
    from backend.models import User
    from backend.routes.analytics import rebuild_dashboard_snapshot

    app = current_app if has_app_context() else _flask_app()
    user_ids = [
        int(row[0])
        for row in (
            db.session.query(User.id)
            .filter(User.is_active.is_(True))
            .order_by(User.id.asc())
            .all()
        )
    ]

    rebuilt = 0
    failed = 0
    for user_id in user_ids:
        try:
            snapshot = rebuild_dashboard_snapshot(user_id=user_id, months_count=months_count)
            cache_bust_dashboard_metrics(user_id, include_snapshots=False)
            rebuilt += 1
        except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
            db.session.rollback()
            failed += 1
            app.logger.exception(
                "Failed to rebuild dashboard snapshot for user_id=%s",
                user_id,
            )

    return {
        "users_processed": len(user_ids),
        "snapshots_rebuilt": rebuilt,
        "failures": failed,
        "months_count": int(months_count),
        "window_end_month": (
            snapshot.window_end_month
            if rebuilt > 0 and "snapshot" in locals()
            else datetime.now(timezone.utc).strftime("%Y-%m")
        ),
    }


def execute_generate_activation_report_artifact(*, days: int, path: str | Path) -> dict[str, int | str]:
    """Build the activation report and persist it as a JSON artifact."""
    from backend.activation_reporting import build_activation_report, write_activation_report_artifact

    report = build_activation_report(days=days)
    output_path = write_activation_report_artifact(path, report)
    return {
        "days": int(days),
        "path": str(output_path),
        "generated_at": str(report["window"]["as_of"]),
    }


def execute_cleanup_abandoned_bank_previews(*, preview_days: int) -> dict:
    """Mark stale staged sync runs as abandoned and delete raw rows."""
    from backend.bank_ops import cleanup_abandoned_bank_previews as _cleanup

    return _cleanup(preview_days=preview_days)


def execute_cleanup_committed_bank_raw_rows(*, committed_days: int) -> int:
    """Delete committed raw bank rows older than retention policy (default: 7 days)."""
    from backend.bank_ops import cleanup_committed_bank_raw_rows as _cleanup

    return _cleanup(committed_days=committed_days)


def execute_purge_stale_revoked_consent_transactions(*, revoked_grace_days: int) -> dict:
    """Purge normalized bank-import transactions for fully-revoked connections past grace period."""
    from backend.bank_ops import purge_stale_revoked_consent_transactions as _purge

    return _purge(revoked_grace_days=revoked_grace_days)


def execute_check_budget_alerts(*, now_utc: datetime | None = None) -> dict:
    """Create monthly budget alerts when spending reaches alert threshold."""
    from backend.models import Budget, Category, Transaction

    now = now_utc or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    app = current_app if has_app_context() else _flask_app()
    month_key = month_key_for_datetime(now)
    threshold = float(app.config.get("BUDGET_ALERT_THRESHOLD_RATIO", 0.9))
    threshold = min(max(threshold, 0.01), 1.5)

    budget_rows = (
        db.session.query(
            Budget.user_id.label("user_id"),
            Budget.category_id.label("category_id"),
            Category.name.label("category_name"),
            Budget.amount_kd.label("budget_kd"),
        )
        .outerjoin(Category, Budget.category_id == Category.id)
        .filter(Budget.month == month_key)
        .filter(expense_category_filter_expr(Category.name, Category.is_income))
        .all()
    )

    ym_expr = month_bucket(Transaction.date)
    spent_rows = (
        db.session.query(
            Transaction.user_id.label("user_id"),
            Transaction.category_id.label("category_id"),
            func.sum(Transaction.amount_kd).label("spent_kd"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(ym_expr == month_key)
        .filter(expense_category_filter_expr(Category.name, Category.is_income))
        .group_by(Transaction.user_id, Transaction.category_id)
        .all()
    )
    spent_by_user_category: dict[tuple[int, int], Decimal] = {
        (int(user_id), int(category_id)): Decimal(str(spent_kd or 0))
        for user_id, category_id, spent_kd in spent_rows
        if user_id is not None and category_id is not None
    }

    existing_keys, dismissed_keys = collect_month_alert_key_sets(month_key)

    budgets_checked = 0
    triggered = 0
    created = 0
    skipped_existing = 0
    skipped_dismissed = 0
    pending_email_payloads: list[dict[str, object]] = []

    for row in budget_rows:
        user_id = int(row.user_id or 0)
        category_id = int(row.category_id or 0)
        if user_id <= 0 or category_id <= 0:
            continue
        budget_kd = Decimal(str(row.budget_kd or 0))
        if budget_kd <= 0:
            continue
        budgets_checked += 1

        spent_kd = spent_by_user_category.get((user_id, category_id), Decimal("0"))
        ratio = float(spent_kd / budget_kd) if budget_kd > 0 else 0.0
        if ratio < threshold:
            continue
        triggered += 1

        alert_key = build_budget_alert_key(month_key, category_id)
        key_pair = (user_id, alert_key)
        if key_pair in dismissed_keys:
            skipped_dismissed += 1
            continue
        if key_pair in existing_keys:
            skipped_existing += 1
            continue

        record_event(
            BUDGET_ALERT_EVENT_NAME,
            user_id,
            properties={
                "alert_key": alert_key,
                "month": month_key,
                "category_id": category_id,
                "category": (row.category_name or "Uncategorized"),
                "budget_kd": format_kd(budget_kd),
                "spent_kd": format_kd(spent_kd),
                "ratio": round(ratio, 4),
                "threshold": round(threshold, 4),
            },
            commit=False,
        )
        existing_keys.add(key_pair)
        created += 1
        pending_email_payloads.append(
            {
                "user_id": user_id,
                "category": str(row.category_name or "Uncategorized"),
                "spent_kd": format_kd(spent_kd),
                "budget_kd": format_kd(budget_kd),
                "ratio_pct": round(ratio * 100, 1),
                "month_key": month_key,
            }
        )

    if created:
        db.session.commit()
        for payload in pending_email_payloads:
            _enqueue_task(send_budget_alert_email, **payload)

    return {
        "month": month_key,
        "threshold": round(threshold, 4),
        "budgets_checked": budgets_checked,
        "triggered": triggered,
        "alerts_created": created,
        "skipped_existing": skipped_existing,
        "skipped_dismissed": skipped_dismissed,
    }


def execute_check_expiring_consents(*, now_utc: datetime | None = None, window_days: int = 7) -> dict:
    """Create product events for consents expiring within window_days."""
    from backend.models import BankConnection, BankConsent
    from backend.product_events import record_event_once

    now = now_utc or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    window_end = now + timedelta(days=max(1, int(window_days)))

    rows = (
        db.session.query(BankConsent, BankConnection.institution_name)
        .join(BankConnection, BankConnection.id == BankConsent.connection_id)
        .filter(BankConsent.status == "active")
        .filter(BankConsent.revoked_at.is_(None))
        .filter(BankConsent.expires_at.is_not(None))
        .filter(BankConsent.expires_at > now)
        .filter(BankConsent.expires_at <= window_end)
        .all()
    )

    created = 0
    pending_email_payloads: list[dict[str, object]] = []
    for consent, institution_name in rows:
        expires_at = consent.expires_at
        if not expires_at:
            continue
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        event_name = f"consent_expiring_{consent.id}_{expires_at.strftime('%Y%m%d')}"[:64]
        inserted = record_event_once(
            event_name,
            consent.user_id,
            properties={
                "consent_id": consent.id,
                "connection_id": consent.connection_id,
                "institution_name": institution_name,
                "expires_at": expires_at.isoformat(),
            },
            commit=False,
        )
        if inserted:
            created += 1
            days_remaining = max(0, (expires_at.date() - now.date()).days)
            pending_email_payloads.append(
                {
                    "user_id": int(consent.user_id),
                    "institution_name": str(institution_name or "Connected bank"),
                    "days_remaining": int(days_remaining),
                    "expires_on": expires_at.date().isoformat(),
                }
            )

    if created:
        db.session.commit()
        for payload in pending_email_payloads:
            _enqueue_task(send_consent_expiry_email, **payload)

    return {
        "window_days": int(window_days),
        "expiring_consents": len(rows),
        "notifications_created": created,
    }


def _month_label(month_key: str) -> str:
    raw = str(month_key or "").strip()
    try:
        dt = datetime.strptime(raw, "%Y-%m")
        return dt.strftime("%B %Y")
    except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        return raw


@celery_app.task(
    name="backend.tasks.send_budget_alert_email",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def send_budget_alert_email(
    self,
    *,
    user_id: int,
    category: str,
    spent_kd: str,
    budget_kd: str,
    ratio_pct: float,
    month_key: str,
) -> dict:
    """Send budget alert email when a category crosses configured threshold."""
    try:
        with _flask_app().app_context():
            recipient = _email_recipient_for_user(int(user_id))
            if not recipient:
                return {"status": "skipped", "reason": "notifications_disabled_or_missing_email"}

            ok = send_templated_email(
                to=recipient,
                subject=f"Budget alert: {category}",
                template_name="budget_alert",
                context={
                    "category": category,
                    "spent_kd": spent_kd,
                    "budget_kd": budget_kd,
                    "ratio_pct": f"{float(ratio_pct or 0):.1f}",
                    "month_label": _month_label(month_key),
                },
            )
            return {"status": "sent" if ok else "failed"}
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.send_consent_expiry_email",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def send_consent_expiry_email(
    self,
    *,
    user_id: int,
    institution_name: str,
    days_remaining: int,
    expires_on: str,
) -> dict:
    """Send reminder email for soon-to-expire bank consent."""
    try:
        with _flask_app().app_context():
            recipient = _email_recipient_for_user(int(user_id))
            if not recipient:
                return {"status": "skipped", "reason": "notifications_disabled_or_missing_email"}

            ok = send_templated_email(
                to=recipient,
                subject=f"Action required: renew {institution_name} connection",
                template_name="consent_expiry",
                context={
                    "institution_name": institution_name,
                    "days_remaining": max(0, int(days_remaining or 0)),
                    "expires_on": expires_on,
                },
            )
            return {"status": "sent" if ok else "failed"}
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.send_goal_milestone_email",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def send_goal_milestone_email(
    self,
    *,
    user_id: int,
    goal_name: str,
    milestone_pct: int,
    current_kd: str,
    target_kd: str,
) -> dict:
    """Send milestone email when a savings goal reaches 25/50/75/100%."""
    try:
        with _flask_app().app_context():
            recipient = _email_recipient_for_user(int(user_id))
            if not recipient:
                return {"status": "skipped", "reason": "notifications_disabled_or_missing_email"}

            milestone = max(0, min(100, int(milestone_pct or 0)))
            ok = send_templated_email(
                to=recipient,
                subject=f"Savings milestone: {goal_name} at {milestone}%",
                template_name="goal_milestone",
                context={
                    "goal_name": goal_name,
                    "milestone_pct": milestone,
                    "current_kd": current_kd,
                    "target_kd": target_kd,
                },
            )
            return {"status": "sent" if ok else "failed"}
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.cleanup_rate_limiter",
    bind=True,
    max_retries=3,
    default_retry_delay=15,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=120)
def cleanup_rate_limiter(self) -> dict:
    """Prune stale rate limiter state."""
    try:
        with _flask_app().app_context():
            acquired, period_key = _acquire_interval_task_lock(
                "cleanup_rate_limiter",
                env_name="MAINT_RATE_LIMIT_CLEANUP_SECONDS",
                default_interval=120,
            )
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            execute_cleanup_rate_limiter()
        return {"status": "ok"}
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=15 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.cleanup_account_tokens",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=15 * 60)
def cleanup_account_tokens(self) -> dict:
    """Delete expired and consumed account-action tokens."""
    try:
        with _flask_app().app_context():
            acquired, period_key = _acquire_interval_task_lock(
                "cleanup_account_tokens",
                env_name="MAINT_ACCOUNT_TOKENS_CLEANUP_SECONDS",
                default_interval=15 * 60,
            )
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            expired, used = execute_cleanup_account_tokens()
        return {"expired_deleted": expired, "used_deleted": used}
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=30 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.cleanup_security_data",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=60 * 60)
def cleanup_security_data(self) -> dict:
    """Prune old security events and ingested messages."""
    try:
        app = _flask_app()
        with app.app_context():
            acquired, period_key = _acquire_interval_task_lock(
                "cleanup_security_data",
                env_name="MAINT_SECURITY_DATA_CLEANUP_SECONDS",
                default_interval=60 * 60,
            )
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            events, ingested = execute_cleanup_security_data(
                security_events_days=app.config["SECURITY_EVENTS_RETENTION_DAYS"],
                ingested_messages_days=app.config["INGESTED_MESSAGES_RETENTION_DAYS"],
            )
        return {"security_events_deleted": events, "ingested_messages_deleted": ingested}
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.cleanup_product_events",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=60 * 60)
def cleanup_product_events(self) -> dict:
    """Prune old product event rows."""
    try:
        app = _flask_app()
        with app.app_context():
            acquired, period_key = _acquire_interval_task_lock(
                "cleanup_product_events",
                env_name="MAINT_PRODUCT_EVENTS_CLEANUP_SECONDS",
                default_interval=60 * 60,
            )
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            deleted = execute_cleanup_product_events(
                product_events_days=app.config.get("PRODUCT_EVENTS_RETENTION_DAYS", 90),
            )
        return {"product_events_deleted": deleted}
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.cleanup_memorized_transactions",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=6 * 60 * 60)
def cleanup_memorized_transactions(self) -> dict:
    """Prune stale memorized transactions."""
    try:
        with _flask_app().app_context():
            acquired, period_key = _acquire_interval_task_lock(
                "cleanup_memorized_transactions",
                env_name="MAINT_MEMORIZED_CLEANUP_SECONDS",
                default_interval=6 * 60 * 60,
            )
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            deleted = execute_cleanup_memorized_transactions()
        return {"memorized_deleted": deleted}
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=120 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.rebuild_dashboard_snapshots",
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=15 * 60)
def rebuild_dashboard_snapshots(self) -> dict:
    """Materialize dashboard snapshots for the default dashboard window."""
    try:
        app = _flask_app()
        with app.app_context():
            acquired, period_key = _acquire_interval_task_lock(
                "rebuild_dashboard_snapshots",
                env_name="MAINT_DASHBOARD_SNAPSHOT_SECONDS",
                default_interval=15 * 60,
            )
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            return execute_rebuild_dashboard_snapshots(
                months_count=int(app.config.get("DASHBOARD_SNAPSHOT_MONTHS", 24)),
            )
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=300 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.generate_activation_report_artifact",
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=60 * 60)
def generate_activation_report_artifact(self) -> dict:
    """Persist the activation report JSON artifact on a fixed interval."""
    try:
        app = _flask_app()
        with app.app_context():
            acquired, period_key = _acquire_interval_task_lock(
                "generate_activation_report_artifact",
                env_name="MAINT_ACTIVATION_REPORT_SECONDS",
                default_interval=60 * 60,
            )
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            return execute_generate_activation_report_artifact(
                days=int(app.config.get("ACTIVATION_REPORT_DAYS", 30)),
                path=app.config.get("ACTIVATION_REPORT_PATH", "reports/activation-report.latest.json"),
            )
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=300 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.check_budget_alerts",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=24 * 60 * 60)
def check_budget_alerts(self) -> dict:
    """Generate monthly budget overage warning alerts."""
    try:
        with _flask_app().app_context():
            acquired, period_key = _acquire_daily_task_lock("check_budget_alerts")
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            return execute_check_budget_alerts()
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=300 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.check_expiring_consents",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=24 * 60 * 60)
def check_expiring_consents(self) -> dict:
    """Create reminder events for consents expiring in the next 7 days."""
    try:
        with _flask_app().app_context():
            acquired, period_key = _acquire_daily_task_lock("check_expiring_consents")
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            return execute_check_expiring_consents(window_days=7)
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=300 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.cleanup_abandoned_bank_previews",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=6 * 60 * 60)
def cleanup_abandoned_bank_previews(self) -> dict:
    """Mark stale staged sync runs as abandoned and delete raw rows."""
    try:
        app = _flask_app()
        with app.app_context():
            acquired, period_key = _acquire_interval_task_lock(
                "cleanup_abandoned_bank_previews",
                env_name="MAINT_BANK_PREVIEW_CLEANUP_SECONDS",
                default_interval=6 * 60 * 60,
            )
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            preview_days = app.config.get("BANK_PREVIEW_RETENTION_DAYS", 7)
            return execute_cleanup_abandoned_bank_previews(preview_days=preview_days)
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=120 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.cleanup_committed_bank_raw_rows",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=24 * 60 * 60)
def cleanup_committed_bank_raw_rows(self) -> dict:
    """Delete committed raw bank rows older than retention policy."""
    try:
        app = _flask_app()
        with app.app_context():
            acquired, period_key = _acquire_interval_task_lock(
                "cleanup_committed_bank_raw_rows",
                env_name="MAINT_BANK_RAW_CLEANUP_SECONDS",
                default_interval=24 * 60 * 60,
            )
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            committed_days = app.config.get("BANK_RAW_RETENTION_DAYS", 7)
            deleted = execute_cleanup_committed_bank_raw_rows(committed_days=committed_days)
            return {"raw_rows_deleted": deleted}
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=300 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.purge_stale_revoked_consent_transactions",
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    acks_late=True,
)
@beat_task_lock(lock_timeout_seconds=24 * 60 * 60)
def purge_stale_revoked_consent_transactions(self) -> dict:
    """Purge normalized bank-import transactions for revoked connections past grace period."""
    try:
        app = _flask_app()
        with app.app_context():
            acquired, period_key = _acquire_daily_task_lock(
                "purge_stale_revoked_consent_transactions"
            )
            if not acquired:
                return {"status": "skipped", "reason": "already_ran", "period_key": period_key}
            grace_days = app.config.get("BANK_REVOKED_NORMALIZED_RETENTION_DAYS", 30)
            result = execute_purge_stale_revoked_consent_transactions(
                revoked_grace_days=grace_days
            )
            return result
    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=300 * (2 ** self.request.retries))


@celery_app.task(
    name="backend.tasks.delete_account_data",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def delete_account_data(self, *, user_id: int, email_hash: str) -> dict:
    """Atomically delete all data for a user.

    Dispatched by the account-deletion route (202 Accepted).  Uses a Redis NX
    lock keyed on ``user_id`` to prevent duplicate executions if the task is
    re-queued.  The lock TTL is 10 minutes — enough for even large datasets.

    After deletion, the task logs a SecurityEvent with ``user_id=None``
    (since the user row no longer exists) so the audit trail survives.
    """
    try:
        with _flask_app().app_context():
            lock_key = f"task_lock:delete_account:{user_id}"
            try:
                from backend.security_ops import _rate_limiter
                redis_client = _rate_limiter._get_redis_client()
                acquired = bool(redis_client.set(lock_key, "1", nx=True, ex=600))
            except Exception:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
                acquired = True  # fallback: proceed without lock

            if not acquired:
                return {"status": "skipped", "reason": "already_running", "user_id": user_id}

            from backend.models import User

            uid = int(user_id)

            # Verify user still exists (may have been deleted by a concurrent call).
            user = db.session.get(User, uid)
            if not user or not bool(user.is_active):
                return {"status": "already_deleted", "user_id": uid}

            purge_user_account_rows(
                user_id=uid,
                email_hash=email_hash,
                audit_ip_address="async_task",
                audit_user_agent=None,
            )

            db.session.commit()
            return {"status": "deleted", "user_id": uid}

    except Exception as exc:  # noqa: BLE001 - worker tasks should log failures and keep the scheduler or worker loop alive.
        raise self.retry(exc=exc, countdown=30 * (2 ** self.request.retries))
