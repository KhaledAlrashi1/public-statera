#!/bin/sh
set -e

echo "[worker] Starting Celery worker..."
exec celery -A backend.worker.celery_app worker \
    --loglevel=info \
    --concurrency="${CELERY_CONCURRENCY:-2}" \
    --queues=celery
