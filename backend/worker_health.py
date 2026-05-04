"""Persistence and query helpers for Celery worker task health."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from flask import current_app, has_app_context

from backend import db
from backend.models import WorkerTaskRun

TRACKED_CELERY_TASKS = (
    "backend.tasks.cleanup_rate_limiter",
    "backend.tasks.cleanup_account_tokens",
    "backend.tasks.cleanup_security_data",
    "backend.tasks.cleanup_product_events",
    "backend.tasks.cleanup_memorized_transactions",
    "backend.tasks.rebuild_dashboard_snapshots",
    "backend.tasks.generate_activation_report_artifact",
    "backend.tasks.check_budget_alerts",
    "backend.tasks.check_expiring_consents",
    "backend.tasks.cleanup_abandoned_bank_previews",
    "backend.tasks.cleanup_committed_bank_raw_rows",
    "backend.tasks.purge_stale_revoked_consent_transactions",
    "backend.tasks.delete_account_data",
)


def _get_logger() -> logging.Logger:
    if has_app_context():
        return current_app.logger
    return logging.getLogger(__name__)


def should_track_worker_task(task_name: str | None) -> bool:
    return bool(task_name and task_name in TRACKED_CELERY_TASKS)


def _get_or_create_task_run(task_name: str) -> WorkerTaskRun:
    row = WorkerTaskRun.query.filter_by(task_name=task_name).first()
    if row is not None:
        return row

    row = WorkerTaskRun(task_name=task_name, last_status="never")
    db.session.add(row)
    db.session.flush()
    return row


def mark_worker_task_started(task_name: str, *, started_at: datetime | None = None) -> None:
    if not should_track_worker_task(task_name):
        return

    ts = started_at or datetime.now(timezone.utc)
    try:
        row = _get_or_create_task_run(task_name)
        row.last_started_at = ts
        row.last_status = "running"
        row.last_error = None
        row.updated_at = ts
        db.session.commit()
    except Exception:  # noqa: BLE001 - health persistence is best-effort and should not break the probe contract.
        db.session.rollback()
        _get_logger().exception(
            "Failed to persist worker task start state for task_name=%s",
            task_name,
        )


def mark_worker_task_finished(
    task_name: str,
    *,
    status: str,
    finished_at: datetime | None = None,
    error: str | None = None,
) -> None:
    if not should_track_worker_task(task_name):
        return

    ts = finished_at or datetime.now(timezone.utc)
    normalized_status = (status or "success").strip().lower()[:32] or "success"
    normalized_error = (error or "").strip()[:255] or None

    try:
        row = _get_or_create_task_run(task_name)
        row.last_finished_at = ts
        row.last_status = normalized_status
        row.last_error = normalized_error
        row.updated_at = ts
        if normalized_status == "failed":
            row.last_failure_at = ts
        else:
            row.last_success_at = ts
        db.session.commit()
    except Exception:  # noqa: BLE001 - health persistence is best-effort and should not break the probe contract.
        db.session.rollback()
        _get_logger().exception(
            "Failed to persist worker task finish state for task_name=%s status=%s",
            task_name,
            normalized_status,
        )


def list_worker_task_health() -> list[dict[str, str | None]]:
    rows = WorkerTaskRun.query.filter(WorkerTaskRun.task_name.in_(TRACKED_CELERY_TASKS)).all()
    by_name = {row.task_name: row for row in rows}

    payload: list[dict[str, str | None]] = []
    for task_name in TRACKED_CELERY_TASKS:
        row = by_name.get(task_name)
        if row is None:
            payload.append(
                {
                    "task_name": task_name,
                    "task_key": task_name.rsplit(".", 1)[-1],
                    "last_started_at": None,
                    "last_finished_at": None,
                    "last_success_at": None,
                    "last_failure_at": None,
                    "last_status": "never",
                    "last_error": None,
                    "updated_at": None,
                }
            )
            continue

        item = row.to_dict()
        item["task_key"] = task_name.rsplit(".", 1)[-1]
        payload.append(item)

    return payload
