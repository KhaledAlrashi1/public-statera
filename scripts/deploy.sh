#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.prod}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy] Missing $ENV_FILE. Copy .env.prod.example and set real secrets first." >&2
  exit 1
fi

export PROD_ENV_FILE="$ENV_FILE"

echo "[deploy] Validating production secrets..."
make check-secrets

echo "[deploy] Pulling latest code..."
git pull --ff-only

export SENTRY_RELEASE="${SENTRY_RELEASE:-$(git rev-parse --short=12 HEAD)}"
echo "[deploy] Using SENTRY_RELEASE=${SENTRY_RELEASE}"

if command -v npm >/dev/null 2>&1; then
  echo "[deploy] Building frontend/dist for nginx static hosting..."
  npm --prefix frontend ci
  npm --prefix frontend run build
else
  echo "[deploy] npm not found; skipping frontend build. Ensure frontend/dist is up to date."
fi

COMPOSE_CMD=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")

echo "[deploy] Building backend/worker/beat images..."
"${COMPOSE_CMD[@]}" build backend worker beat

echo "[deploy] Starting postgres and redis..."
"${COMPOSE_CMD[@]}" up -d postgres redis

echo "[deploy] Applying database migrations..."
"${COMPOSE_CMD[@]}" run --rm backend flask db upgrade

echo "[deploy] Starting backend, workers, and nginx..."
"${COMPOSE_CMD[@]}" up -d backend worker beat nginx

echo "[deploy] Reloading nginx configuration..."
"${COMPOSE_CMD[@]}" exec -T nginx nginx -s reload

echo "[deploy] Current service status:"
"${COMPOSE_CMD[@]}" ps
