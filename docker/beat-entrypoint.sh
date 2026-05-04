#!/bin/sh
set -e

echo "[beat] Starting Celery beat with in-memory scheduler..."
exec celery -A backend.worker.celery_app beat \
    --loglevel=info \
    --scheduler celery.beat.Scheduler
