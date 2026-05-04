"""Celery application entrypoint for background maintenance tasks."""

from __future__ import annotations

import logging
import os
from functools import lru_cache

from celery import Celery
from celery.schedules import crontab

logger = logging.getLogger(__name__)


def _schedule_seconds(env_name: str, default: int) -> int:
    raw = os.getenv(env_name, str(default))
    try:
        parsed = int(raw)
    except Exception:  # noqa: BLE001 - worker startup should stay alive when optional setup hooks fail.
        return default
    return parsed if parsed > 0 else default


def _build_celery() -> Celery:
    broker = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/1")
    backend = os.getenv("CELERY_RESULT_BACKEND", broker)
    app = Celery(
        "backend_worker",
        broker=broker,
        backend=backend,
        include=["backend.tasks"],
    )
    app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        beat_schedule={
            "maint-rate-limiter": {
                "task": "backend.tasks.cleanup_rate_limiter",
                "schedule": _schedule_seconds("MAINT_RATE_LIMIT_CLEANUP_SECONDS", 120),
            },
            "maint-account-tokens": {
                "task": "backend.tasks.cleanup_account_tokens",
                "schedule": _schedule_seconds("MAINT_ACCOUNT_TOKENS_CLEANUP_SECONDS", 15 * 60),
            },
            "maint-security-data": {
                "task": "backend.tasks.cleanup_security_data",
                "schedule": _schedule_seconds("MAINT_SECURITY_DATA_CLEANUP_SECONDS", 60 * 60),
            },
            "maint-product-events": {
                "task": "backend.tasks.cleanup_product_events",
                "schedule": _schedule_seconds("MAINT_PRODUCT_EVENTS_CLEANUP_SECONDS", 60 * 60),
            },
            "maint-memorized": {
                "task": "backend.tasks.cleanup_memorized_transactions",
                "schedule": _schedule_seconds("MAINT_MEMORIZED_CLEANUP_SECONDS", 6 * 60 * 60),
            },
            "maint-dashboard-snapshots": {
                "task": "backend.tasks.rebuild_dashboard_snapshots",
                "schedule": _schedule_seconds("MAINT_DASHBOARD_SNAPSHOT_SECONDS", 15 * 60),
            },
            "maint-activation-report": {
                "task": "backend.tasks.generate_activation_report_artifact",
                "schedule": _schedule_seconds("MAINT_ACTIVATION_REPORT_SECONDS", 60 * 60),
            },
            "budget-alerts-daily": {
                "task": "backend.tasks.check_budget_alerts",
                "schedule": crontab(hour=9, minute=0),
            },
            "consent-expiry-daily": {
                "task": "backend.tasks.check_expiring_consents",
                "schedule": crontab(hour=9, minute=15),
            },
            "maint-bank-abandoned-previews": {
                "task": "backend.tasks.cleanup_abandoned_bank_previews",
                "schedule": _schedule_seconds("MAINT_BANK_PREVIEW_CLEANUP_SECONDS", 6 * 60 * 60),
            },
            "maint-bank-committed-raw": {
                "task": "backend.tasks.cleanup_committed_bank_raw_rows",
                "schedule": _schedule_seconds("MAINT_BANK_RAW_CLEANUP_SECONDS", 24 * 60 * 60),
            },
            "maint-purge-revoked-consent-txns": {
                "task": "backend.tasks.purge_stale_revoked_consent_transactions",
                "schedule": crontab(hour=3, minute=0),  # daily at 03:00 UTC
            },
        },
    )
    return app


celery_app = _build_celery()


@lru_cache(maxsize=1)
def _flask_app():
    """Construct Flask app lazily and cache it per Celery worker process."""
    from backend import create_app

    return create_app()
