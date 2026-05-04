#!/bin/sh
set -e

export FLASK_APP="${FLASK_APP:-run.py}"

echo "[entrypoint] Running database migrations..."
flask db upgrade

echo "[entrypoint] Starting gunicorn..."
exec gunicorn \
    --workers "${GUNICORN_WORKERS:-1}" \
    --threads "${GUNICORN_THREADS:-4}" \
    --bind "0.0.0.0:8000" \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    "run:app"
