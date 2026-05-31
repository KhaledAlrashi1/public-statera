#!/usr/bin/env bash
# deploy/backup-db.sh — encrypted MySQL backup to Cloudflare R2.
#
# Runs daily at 02:30 UTC as the deploy user via statera-backup.timer.
# Prefix routing: daily/ always · weekly/ on Sundays · monthly/ on 1st of month.
# Pipeline: mysqldump | zstd -T0 -12 | age -R <recipients> → /dev/shm → rclone → verify → ping
#
# Secrets sourced from sops at runtime (§4 fix-forward pattern — temp file, never VAR=$(sops …)).
# age recipients derived from .sops.yaml at runtime — no hardcoded copy here.
set -euo pipefail

# rclone installed to ~/bin on this server (no system-wide sudo at install time).
# Systemd does not source login-shell PATH, so prepend explicitly.
export PATH="${HOME}/bin:${PATH}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "${SCRIPT_DIR}")"

# ── cleanup trap ──────────────────────────────────────────────────────────────
WORK_DIR=""
cleanup() {
  [[ -n "${WORK_DIR}" && -d "${WORK_DIR}" ]] && rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

# ── decrypt secrets ───────────────────────────────────────────────────────────
# Temp file in /dev/shm (RAM-backed); fallback to /tmp.
# Never use VAR=$(sops …) — bash swallows exit codes from command substitutions.
WORK_DIR=$(mktemp -d --tmpdir=/dev/shm 2>/dev/null || mktemp -d)
ENV_FILE="${WORK_DIR}/env"
SECRETS_FILE="${REPO_DIR}/secrets/.env.prod.sops.yaml"

if ! SOPS_AGE_KEY_FILE="${HOME}/.config/sops/age/keys.txt" \
       sops -d --output-type dotenv "${SECRETS_FILE}" > "${ENV_FILE}"; then
  echo "ERROR: sops decryption failed" >&2; exit 1
fi
[[ -s "${ENV_FILE}" ]] || { echo "ERROR: decrypted env is empty" >&2; exit 1; }

# Non-evaluating line-by-line export: splits on first '=' only so a value
# containing '=' (e.g. base64) is handled correctly. Never evaluates the RHS
# through bash — prevents any accidental expansion of $ or ` in secret values.
while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" || "${line}" == \#* ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
  export "${key}=${val}"
done < "${ENV_FILE}"

# ── validate required vars ────────────────────────────────────────────────────
for var in MYSQL_ROOT_PASSWORD MYSQL_DATABASE \
           R2_S3_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  [[ -n "${!var:-}" ]] || { echo "ERROR: ${var} is unset or empty" >&2; exit 1; }
done

# ── timestamp + prefix routing ────────────────────────────────────────────────
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
DOW=$(date -u '+%u')   # 1=Mon … 7=Sun
DOM=$(date -u '+%d')   # 01–31
OBJECT_NAME="statera-${TIMESTAMP}.sql.zst.age"

PREFIXES="daily"
[[ "${DOW}" == "7"  ]] && PREFIXES="${PREFIXES} weekly"
[[ "${DOM}" == "01" ]] && PREFIXES="${PREFIXES} monthly"

echo "[backup] ${TIMESTAMP}  db=${MYSQL_DATABASE}  prefixes=${PREFIXES}"

# ── age recipients from .sops.yaml (single source of truth) ──────────────────
# grep -oE extracts bare age1… tokens; format-independent (no whitespace/comma
# stripping needed). sort -u deduplicates across multiple creation rules.
RECIPIENTS_FILE="${WORK_DIR}/recipients.txt"
grep -oE 'age1[a-z0-9]+' "${REPO_DIR}/.sops.yaml" | sort -u > "${RECIPIENTS_FILE}"
[[ -s "${RECIPIENTS_FILE}" ]] || { echo "ERROR: no age recipients found in .sops.yaml" >&2; exit 1; }
echo "[backup] recipients: $(wc -l < "${RECIPIENTS_FILE}") keys from .sops.yaml"

# ── rclone remote config via env (no rclone.conf on disk) ────────────────────
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="${R2_S3_ENDPOINT}"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
# Bucket already exists; skip the create-if-missing check on every upload.
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

# ── backup pipeline → /dev/shm ────────────────────────────────────────────────
# MYSQL_PWD env var prevents the "password on command line is insecure" journal
# warning. Passed via -e so it's scoped to the mysqldump process only.
BACKUP_FILE="${WORK_DIR}/${OBJECT_NAME}"

echo "[backup] Running mysqldump | zstd | age …"
if ! docker compose -f "${REPO_DIR}/docker-compose.yml" exec -T \
       -e MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql \
       mysqldump \
         -uroot \
         --single-transaction \
         --routines \
         --triggers \
         --events \
         --hex-blob \
         --set-gtid-purged=OFF \
         --databases "${MYSQL_DATABASE}" \
     | zstd -T0 -12 \
     | age -R "${RECIPIENTS_FILE}" \
     > "${BACKUP_FILE}"; then
  echo "ERROR: backup pipeline failed" >&2; exit 1
fi

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
BACKUP_BYTES=$(wc -c < "${BACKUP_FILE}" | tr -d ' ')
echo "[backup] Encrypted object: ${OBJECT_NAME} (${BACKUP_SIZE} / ${BACKUP_BYTES} bytes)"

# ── upload + verify ───────────────────────────────────────────────────────────
# rclone copy exit code verifies the transferred bytes.
# rclone size does a single HEAD-equivalent stat — not a ListObjects call —
# so it works with a scoped Object Read+Write token that lacks Admin/List.
# If rclone size returns a permission error (scoped token too narrow),
# the script falls back to trusting rclone copy's exit code only and logs a warning.
for prefix in ${PREFIXES}; do
  echo "[backup] Uploading to R2:${R2_BUCKET}/${prefix}/${OBJECT_NAME}"

  if ! rclone copy "${BACKUP_FILE}" "R2:${R2_BUCKET}/${prefix}/" \
         --no-traverse; then
    echo "ERROR: rclone upload failed for prefix=${prefix}" >&2; exit 1
  fi
  echo "[backup] rclone copy: OK (${prefix}/)"

  # Explicit size verification.
  # rclone size on a scoped Object Read+Write token may return {"count":0,"bytes":0}
  # without a non-zero exit code when the token lacks ListObjects/HeadObject access.
  # Treat count=0 the same as an error exit: log a warning and trust rclone copy.
  REMOTE_JSON=$(rclone size "R2:${R2_BUCKET}/${prefix}/${OBJECT_NAME}" --json 2>/dev/null) || {
    echo "[backup] WARN: rclone size failed for ${prefix}/ (token may lack stat permission) — trusting rclone copy exit code"
    REMOTE_JSON=""
  }
  if [[ -n "${REMOTE_JSON}" ]]; then
    REMOTE_BYTES=$(echo "${REMOTE_JSON}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('SKIP' if d.get('count', 0) == 0 else d['bytes'])
" 2>/dev/null || echo "0")
    if [[ "${REMOTE_BYTES}" == "SKIP" ]]; then
      echo "[backup] WARN: rclone size returned count=0 for ${prefix}/ (scoped token lacks stat permission) — trusting rclone copy exit code"
    elif [[ "${REMOTE_BYTES}" == "${BACKUP_BYTES}" ]]; then
      echo "[backup] rclone size: OK — remote=${REMOTE_BYTES} bytes matches local"
    else
      echo "ERROR: size mismatch — remote=${REMOTE_BYTES} local=${BACKUP_BYTES}" >&2; exit 1
    fi
  fi
done

# ── healthcheck ping (no-op if unset — wired in 8f-3) ────────────────────────
if [[ -n "${HEALTHCHECK_PING_URL:-}" ]]; then
  curl -fsS --retry 3 --max-time 10 "${HEALTHCHECK_PING_URL}" > /dev/null
  echo "[backup] Healthcheck pinged: ${HEALTHCHECK_PING_URL}"
fi

echo "[backup] Complete."
