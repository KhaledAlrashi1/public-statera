#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.prod}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd pg_dump
require_cmd aws

required_vars=(
  POSTGRES_HOST
  POSTGRES_PORT
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  BACKUP_S3_BUCKET
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_DEFAULT_REGION
)

missing=0
for key in "${required_vars[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required environment variable: ${key}" >&2
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
backup_dir="${BACKUP_DIR:-$ROOT_DIR/backups}"
backup_prefix="${BACKUP_S3_PREFIX:-personal_statera/backups}"
filename="${POSTGRES_DB}_${timestamp}.dump"
dump_file="${backup_dir}/${filename}"
s3_key="${backup_prefix%/}/${filename}"

mkdir -p "$backup_dir"

echo "[backup] Creating pg_dump at ${dump_file} ..."
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --file="${dump_file}"

echo "[backup] Uploading to s3://${BACKUP_S3_BUCKET}/${s3_key} ..."
if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
  aws --endpoint-url "${BACKUP_S3_ENDPOINT}" s3 cp "${dump_file}" "s3://${BACKUP_S3_BUCKET}/${s3_key}"
else
  aws s3 cp "${dump_file}" "s3://${BACKUP_S3_BUCKET}/${s3_key}"
fi

echo "[backup] Backup complete."
echo "[backup] Local file: ${dump_file}"
echo "[backup] Restore example:"
echo "  pg_restore --clean --if-exists --no-owner --no-privileges \\"
echo "    --host=${POSTGRES_HOST} --port=${POSTGRES_PORT} --username=${POSTGRES_USER} \\"
echo "    --dbname=<target_db> ${dump_file}"
