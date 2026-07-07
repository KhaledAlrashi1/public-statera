#!/usr/bin/env bash
# deploy/restore-drill.sh — 8f-2 restore drill, Stage 0 (pull+integrity) + Stage 1 (restore+verify).
#
# DRILL-ONLY. Restores a real R2 backup into an ISOLATED, throwaway scratch MySQL container —
# NEVER into production. Runs server-side as the deploy user; decrypts with the SERVER age key
# so production PII never leaves the box. Linux-only (uses free/df); the drill runs on the
# production server by design. Stage 2/3 (re-purge) run separately via deploy/restore-repurge.ts
# against the scratch container this script leaves up; tear down with `--teardown`.
#
# Usage:
#   bash deploy/restore-drill.sh --object statera-2026-07-05T02:30:00Z.sql.zst.age [--anchor-email you@example.com]
#   bash deploy/restore-drill.sh --verify-only statera-2026-07-01T02:30:00Z.sql.zst.age   # Stage 0 only (monthly decrypt check)
#   bash deploy/restore-drill.sh --teardown
#
# A1: --object must be a daily/ backup dated BEFORE the operator's 2026-07-06 deletion, so Stage 3
#     is a known-answer test (exactly one real tombstone match). Also --verify-only one monthly/ object.
set -euo pipefail

export PATH="${HOME}/bin:${PATH}"   # rclone installed to ~/bin (see backups.md)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "${SCRIPT_DIR}")"

# ── config ────────────────────────────────────────────────────────────────────
SCRATCH_NAME="statera-restore-drill"
SCRATCH_IMAGE="mysql:8.0.41"          # pinned to prod (CLAUDE.md)
SCRATCH_HOSTPORT="127.0.0.1:3307"     # localhost only — never published publicly
AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-${HOME}/.config/sops/age/keys.txt}"
MIN_FREE_MEM_MB="${MIN_FREE_MEM_MB:-512}"
MIN_FREE_DISK_MB="${MIN_FREE_DISK_MB:-2048}"

# Declared table set (A2): 20 Drizzle schema tables + the migrations journal. Stage 1 fails on
# ANY delta in EITHER direction — no discover-and-accept. Update deliberately when the schema changes.
DECLARED_TABLES=$(cat <<'EOF'
__drizzle_migrations
account_action_tokens
bank_connections
bank_consents
bank_sync_runs
budgets
categories
dashboard_snapshots
data_access_logs
debt_accounts
memorized_transactions
merchants
product_events
raw_bank_transactions
savings_goals
security_events
template_suggestion_feedback
transactions
user_profiles
users
worker_task_runs
EOF
)

MODE="setup"
OBJECT=""
VERIFY_ONLY_OBJECT=""
ANCHOR_EMAIL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --object)       OBJECT="$2"; shift 2 ;;
    --verify-only)  MODE="verify-only"; VERIFY_ONLY_OBJECT="$2"; shift 2 ;;
    --anchor-email) ANCHOR_EMAIL="$2"; shift 2 ;;
    --teardown)     MODE="teardown"; shift ;;
    --min-mem-mb)   MIN_FREE_MEM_MB="$2"; shift 2 ;;
    --min-disk-mb)  MIN_FREE_DISK_MB="$2"; shift 2 ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 2 ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }

# ── teardown mode ─────────────────────────────────────────────────────────────
if [[ "${MODE}" == "teardown" ]]; then
  echo "[drill] Tearing down scratch container '${SCRATCH_NAME}' …"
  docker rm -f -v "${SCRATCH_NAME}" >/dev/null 2>&1 || true
  if docker ps -a --format '{{.Names}}' | grep -qx "${SCRATCH_NAME}"; then
    die "scratch container '${SCRATCH_NAME}' still present after teardown"
  fi
  echo "[drill] Teardown OK — scratch container gone."
  exit 0
fi

# ── resource guard (A4) — abort cleanly BEFORE any container/decrypt work ──────
FREE_MEM_MB=$(free -m | awk '/^Mem:/{print $7}')     # 'available' column
FREE_DISK_MB=$(df -Pm "${HOME}" | awk 'NR==2{print $4}')
echo "[drill] Resource check: free mem=${FREE_MEM_MB}MB (min ${MIN_FREE_MEM_MB}), free disk=${FREE_DISK_MB}MB (min ${MIN_FREE_DISK_MB})"
[[ "${FREE_MEM_MB}" -ge "${MIN_FREE_MEM_MB}" ]]  || die "insufficient free memory (${FREE_MEM_MB}MB < ${MIN_FREE_MEM_MB}MB) — aborting before scratch container"
[[ "${FREE_DISK_MB}" -ge "${MIN_FREE_DISK_MB}" ]] || die "insufficient free disk (${FREE_DISK_MB}MB < ${MIN_FREE_DISK_MB}MB) — aborting before scratch container"

# ── work dir + cleanup trap (decrypted PII is shredded on every exit path) ─────
WORK_DIR=""
cleanup() {
  if [[ -n "${WORK_DIR}" && -d "${WORK_DIR}" ]]; then
    find "${WORK_DIR}" -type f -exec shred -u {} + 2>/dev/null || true
    rm -rf "${WORK_DIR}"
  fi
}
trap cleanup EXIT
WORK_DIR=$(mktemp -d --tmpdir=/dev/shm 2>/dev/null || mktemp -d)

# ── decrypt secrets (R2 creds + MYSQL_DATABASE) — mirrors backup-db.sh §4 ──────
ENV_FILE="${WORK_DIR}/env"
SECRETS_FILE="${REPO_DIR}/secrets/.env.prod.sops.yaml"
if ! SOPS_AGE_KEY_FILE="${AGE_KEY_FILE}" sops -d --output-type dotenv "${SECRETS_FILE}" > "${ENV_FILE}"; then
  die "sops decryption failed"
fi
[[ -s "${ENV_FILE}" ]] || die "decrypted env is empty"
while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" || "${line}" == \#* ]] && continue
  key="${line%%=*}"; val="${line#*=}"
  [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
  export "${key}=${val}"
done < "${ENV_FILE}"
for var in R2_S3_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET MYSQL_DATABASE; do
  [[ -n "${!var:-}" ]] || die "${var} is unset or empty"
done

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="${R2_S3_ENDPOINT}"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"

# ── Stage 0: pull + integrity ─────────────────────────────────────────────────
# Args: <object-name> <r2-prefix>. Downloads, sha256s, decrypts, asserts a complete dump.
# Sets DECRYPTED_SQL + BACKUP_TS globals on success.
DECRYPTED_SQL=""
BACKUP_TS=""
stage0() {
  local object="$1" prefix="$2"
  echo "[drill] Stage 0: pulling R2:${R2_BUCKET}/${prefix}/${object} (read-only) …"
  rclone copy "R2:${R2_BUCKET}/${prefix}/${object}" "${WORK_DIR}/" --no-traverse \
    || die "rclone pull failed for ${prefix}/${object}"
  local enc="${WORK_DIR}/${object}"
  [[ -s "${enc}" ]] || die "downloaded object is empty: ${object}"
  echo "[drill]   object sha256: $(sha256sum "${enc}" | cut -d' ' -f1)"

  local sqlout="${WORK_DIR}/${object%.zst.age}"   # strip .zst.age → …sql
  if ! age -d -i "${AGE_KEY_FILE}" "${enc}" | zstd -d > "${sqlout}"; then
    die "decrypt/decompress failed for ${object}"
  fi
  [[ -s "${sqlout}" ]] || die "decrypted SQL is empty: ${object}"
  echo "[drill]   decrypted sha256: $(sha256sum "${sqlout}" | cut -d' ' -f1)  size: $(wc -c < "${sqlout}") bytes"
  # mysqldump writes '-- Dump completed on …' as its final line — a truncation guard.
  tail -c 4096 "${sqlout}" | grep -q -- "-- Dump completed" \
    || die "no '-- Dump completed' marker in ${object} — dump is truncated/corrupt"
  echo "[drill]   Stage 0 PASS — object decrypts to a complete dump."

  DECRYPTED_SQL="${sqlout}"
  # T_backup from object name: statera-<TIMESTAMP>.sql.zst.age
  BACKUP_TS="${object#statera-}"; BACKUP_TS="${BACKUP_TS%.sql.zst.age}"
}

if [[ "${MODE}" == "verify-only" ]]; then
  [[ -n "${VERIFY_ONLY_OBJECT}" ]] || die "--verify-only requires an object name"
  stage0 "${VERIFY_ONLY_OBJECT}" "monthly"
  echo "[drill] verify-only complete — monthly object ${VERIFY_ONLY_OBJECT} is decryptable (T_backup=${BACKUP_TS})."
  exit 0
fi

# ── setup mode: full Stage 0 + Stage 1 ────────────────────────────────────────
[[ -n "${OBJECT}" ]] || die "--object is required for the full drill (a daily/ backup before 2026-07-06 per A1)"
stage0 "${OBJECT}" "daily"

# Refuse to clobber a leftover scratch container from a prior run.
if docker ps -a --format '{{.Names}}' | grep -qx "${SCRATCH_NAME}"; then
  die "scratch container '${SCRATCH_NAME}' already exists — run '--teardown' first"
fi

SCRATCH_PW="$(openssl rand -hex 16)"
echo "[drill] Stage 1: starting isolated scratch container '${SCRATCH_NAME}' (${SCRATCH_IMAGE}) on ${SCRATCH_HOSTPORT} …"
docker run -d --name "${SCRATCH_NAME}" \
  -e MYSQL_ROOT_PASSWORD="${SCRATCH_PW}" \
  -p "${SCRATCH_HOSTPORT}:3306" \
  "${SCRATCH_IMAGE}" >/dev/null \
  || die "failed to start scratch container"

echo "[drill]   waiting for MySQL to accept connections …"
READY=0
for _ in $(seq 1 60); do
  if docker exec "${SCRATCH_NAME}" mysqladmin ping -uroot -p"${SCRATCH_PW}" --silent >/dev/null 2>&1; then
    READY=1; break
  fi
  sleep 2
done
[[ "${READY}" == "1" ]] || die "scratch MySQL did not become ready within 120s"

echo "[drill]   loading dump into scratch container …"
docker exec -i "${SCRATCH_NAME}" mysql -uroot -p"${SCRATCH_PW}" < "${DECRYPTED_SQL}" \
  || die "restore (mysql < dump) failed"

# Decrypted PII is now inside the scratch DB — shred the on-disk copy immediately.
shred -u "${DECRYPTED_SQL}" 2>/dev/null || rm -f "${DECRYPTED_SQL}"

sq() { docker exec "${SCRATCH_NAME}" mysql -uroot -p"${SCRATCH_PW}" -N -e "$1" "${MYSQL_DATABASE}"; }

# Assert the declared table set exactly (A2), both directions.
ACTUAL_TABLES=$(sq "SHOW TABLES" | sort)
EXPECTED_TABLES=$(echo "${DECLARED_TABLES}" | sort)
MISSING=$(comm -23 <(echo "${EXPECTED_TABLES}") <(echo "${ACTUAL_TABLES}"))
EXTRA=$(comm -13 <(echo "${EXPECTED_TABLES}") <(echo "${ACTUAL_TABLES}"))
if [[ -n "${MISSING}" || -n "${EXTRA}" ]]; then
  [[ -n "${MISSING}" ]] && echo "  missing tables: ${MISSING}" >&2
  [[ -n "${EXTRA}"   ]] && echo "  unexpected tables: ${EXTRA}" >&2
  die "restored table set does not match the declared set"
fi
echo "[drill]   table set: OK — matches the declared 21-table set exactly."

# Row-count manifest (recorded as the checksum of a good restore).
echo "[drill]   row-count manifest:"
while IFS= read -r t; do
  [[ -z "${t}" ]] && continue
  printf '     %-32s %s\n' "${t}" "$(sq "SELECT COUNT(*) FROM \`${t}\`")"
done <<< "${EXPECTED_TABLES}"

# FK-integrity probes — each must be 0 (no orphaned owned rows).
for probe in \
  "transactions:SELECT COUNT(*) FROM transactions t LEFT JOIN users u ON t.user_id=u.id WHERE u.id IS NULL" \
  "user_profiles:SELECT COUNT(*) FROM user_profiles p LEFT JOIN users u ON p.user_id=u.id WHERE u.id IS NULL" \
  "budgets:SELECT COUNT(*) FROM budgets b LEFT JOIN users u ON b.user_id=u.id WHERE u.id IS NULL" \
  "categories:SELECT COUNT(*) FROM categories c LEFT JOIN users u ON c.user_id=u.id WHERE u.id IS NULL" \
  "merchants:SELECT COUNT(*) FROM merchants m LEFT JOIN users u ON m.user_id=u.id WHERE u.id IS NULL"; do
  name="${probe%%:*}"; q="${probe#*:}"
  n=$(sq "${q}")
  [[ "${n}" == "0" ]] || die "FK-integrity probe failed: ${name} has ${n} orphaned row(s)"
done
echo "[drill]   FK-integrity probes: OK — 0 orphaned owned rows."

# Anchor row (optional): a specific active user proves real data restored.
if [[ -n "${ANCHOR_EMAIL}" ]]; then
  # Validate against a strict email regex BEFORE interpolating into SQL — rejects quotes and
  # any injection payload; a well-formed email cannot alter the query.
  [[ "${ANCHOR_EMAIL}" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] \
    || die "invalid --anchor-email format: ${ANCHOR_EMAIL}"
  ANCHOR_N=$(docker exec "${SCRATCH_NAME}" mysql -uroot -p"${SCRATCH_PW}" -N \
    -e "SELECT COUNT(*) FROM users WHERE email = '${ANCHOR_EMAIL}' AND is_active = 1" "${MYSQL_DATABASE}")
  [[ "${ANCHOR_N}" == "1" ]] || die "anchor assertion failed: expected exactly 1 active user with the anchor email, got ${ANCHOR_N}"
  echo "[drill]   anchor: OK — exactly one active user matches the anchor email."
fi

cat <<EOF

[drill] Stage 1 PASS — restore verified. Scratch container is LEFT RUNNING for Stage 2/3.
        T_backup     : ${BACKUP_TS}
        scratch URL  : mysql://root:${SCRATCH_PW}@${SCRATCH_HOSTPORT}/${MYSQL_DATABASE}
        Next:
          # Stage 2 (deterministic gate check):
          pnpm --filter statera-api exec tsx "${SCRIPT_DIR}/restore-repurge.ts" \\
            --mode fixture --url 'mysql://root:${SCRATCH_PW}@${SCRATCH_HOSTPORT}/${MYSQL_DATABASE}' --t-backup '${BACKUP_TS}'
          # Stage 3 (real-data known-answer, expect exactly 1 = operator):
          #   export prod tombstones (read-only) with created_at > '${BACKUP_TS}' to a JSON file, then:
          pnpm --filter statera-api exec tsx "${SCRIPT_DIR}/restore-repurge.ts" \\
            --mode repurge --url 'mysql://root:${SCRATCH_PW}@${SCRATCH_HOSTPORT}/${MYSQL_DATABASE}' \\
            --t-backup '${BACKUP_TS}' --tombstones /dev/shm/prod-tombstones.json --expect 1
        Teardown when done:
          bash ${SCRIPT_DIR}/restore-drill.sh --teardown
EOF
