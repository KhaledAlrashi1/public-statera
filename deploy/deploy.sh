#!/usr/bin/env bash
# deploy/deploy.sh — production deploy script
#
# Invoked by CI over SSH. The server's authorized_keys forces this script as the
# command= for the CI deploy key, so it always runs regardless of what the SSH
# client requests. GIT_SHA is passed via SSH AcceptEnv (client: SendEnv=DEPLOY_SHA;
# server: AcceptEnv DEPLOY_SHA in sshd_config). See deploy/DEPLOY.md for setup.
#
# Can also be run manually as the deploy user:
#   GIT_SHA=<sha> bash ~/statera/deploy/deploy.sh

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

# GIT_SHA arrives as DEPLOY_SHA via SSH AcceptEnv; fall back to direct env for
# manual runs.
GIT_SHA="${GIT_SHA:-${DEPLOY_SHA:-}}"
GIT_SHA="${GIT_SHA:?GIT_SHA (or DEPLOY_SHA) is required}"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_DIR/docker-compose.prod.yml"
SECRETS_FILE="$REPO_DIR/secrets/.env.prod.sops.yaml"
REGISTRY="${REGISTRY:-ghcr.io/khaledalrashidi1}"
IMAGE="${REGISTRY}/statera-api:${GIT_SHA}"

# Set SOPS_AGE_KEY_FILE explicitly so it is not sensitive to $HOME on CI runners.
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"

RED="\033[0;31m"
GRN="\033[0;32m"
YLW="\033[0;33m"
RST="\033[0m"

log()  { echo -e "${GRN}[deploy]${RST} $*"; }
warn() { echo -e "${YLW}[deploy WARN]${RST} $*"; }
die()  { echo -e "${RED}[deploy ERROR]${RST} $*" >&2; exit 1; }

# ── Helpers ───────────────────────────────────────────────────────────────────

# Decrypt secrets once into a variable. Never written to disk.
# printf '%s' avoids echo interpreting escape sequences that may appear in secret values.
log "decrypting secrets"
ENV_VARS=$(sops -d --output-type dotenv "$SECRETS_FILE")

# compose(): run docker compose with GIT_SHA + decrypted env vars pre-applied.
# Uses printf '%s' rather than echo to protect secret values with escape sequences.
compose() {
  GIT_SHA="$GIT_SHA" docker compose \
    --env-file <(printf '%s' "$ENV_VARS") \
    -f "$COMPOSE_FILE" \
    "$@"
}

# _health_check(): poll /healthz on the running api container.
# Uses docker compose exec (no new container) so GIT_SHA is irrelevant here.
# Returns 0 when healthy, 1 on timeout.
_health_check() {
  local max="${1:-120}" step=5 elapsed=0
  log "waiting for /healthz (timeout: ${max}s)"
  until docker compose -f "$COMPOSE_FILE" exec -T api \
      node -e "const h=require('http');h.get('http://127.0.0.1:3000/healthz',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))" \
      2>/dev/null; do
    sleep $step
    elapsed=$((elapsed + step))
    (( elapsed < max )) || return 1
  done
  return 0
}

# _rollback(): revert api and worker to PREV_SHA.
# Migrations are NOT reverted — they must be additive-only (see CLAUDE.md standing rules).
# After reverting the image, runs a health check; if rollback also fails, exits loudly.
_rollback() {
  if [[ -z "${PREV_SHA:-}" ]]; then
    die "health check timed out AND no previous SHA recorded — manual recovery required.
  Check running containers: docker compose -f $COMPOSE_FILE ps
  Check GHCR for a valid previous image tag and run:
    GIT_SHA=<prev-sha> $0"
  fi

  warn "health check timed out — rolling back to $PREV_SHA"

  # Pull the previous image before attempting rollback.
  # The local cache may have been GC'd if the previous deploy was weeks ago.
  docker pull "${REGISTRY}/statera-api:${PREV_SHA}" \
    || die "rollback image pull failed for ${PREV_SHA} — manual recovery required"

  GIT_SHA="$PREV_SHA" docker compose \
    --env-file <(printf '%s' "$ENV_VARS") \
    -f "$COMPOSE_FILE" \
    up -d api worker

  if _health_check 60; then
    warn "rollback to $PREV_SHA succeeded. New version $GIT_SHA was NOT deployed."
    warn "Investigate before re-deploying: docker compose -f $COMPOSE_FILE logs api"
    exit 1
  else
    die "ROLLBACK TO $PREV_SHA ALSO FAILED — both versions are unhealthy.
  Manual recovery required:
    1. SSH to server as deploy user
    2. docker compose -f $COMPOSE_FILE logs api
    3. docker compose -f $COMPOSE_FILE logs worker
    4. docker compose -f $COMPOSE_FILE restart api worker  (if transient failure)
    5. Or pin to a known-good SHA: GIT_SHA=<sha> $0"
  fi
}

# ── §1: Checkout deployed commit ──────────────────────────────────────────────

log "§1 — checkout $GIT_SHA"
git -C "$REPO_DIR" fetch origin
# Reset to the exact SHA being deployed so the repo, Compose file, and image
# are all at the same commit. For rollback (workflow_dispatch with old SHA),
# this ensures the Compose config and sops file match the image being deployed.
git -C "$REPO_DIR" reset --hard "$GIT_SHA"

# ── §2: Pull new image ────────────────────────────────────────────────────────

log "§2 — docker pull $IMAGE"
docker pull "$IMAGE"

# ── §3: Record previous SHA for rollback ─────────────────────────────────────

log "§3 — recording previous SHA"
# Read the OCI revision label from the running api container (set by build-push-action).
# If no container is running (first deploy), PREV_SHA is empty; rollback will log clearly.
PREV_SHA=$(
  docker inspect \
    --format='{{index .Config.Labels "org.opencontainers.image.revision"}}' \
    "$(compose ps -q api 2>/dev/null | head -1)" \
    2>/dev/null || true
)
log "  previous SHA: ${PREV_SHA:-<none — first deploy or container not running>}"

# ── §4: Run migrations ────────────────────────────────────────────────────────

log "§4 — running migrations"
# The migrate service (profiles: [migrate]) uses the same image as api/worker,
# tagged ${GIT_SHA}. docker compose run honors depends_on, so MySQL is started
# and waited healthy before migrate runs.
# If drizzle-kit migrate exits non-zero, set -euo pipefail aborts this script here.
# compose up -d in §5 is never reached; the running version continues serving.
#
# MySQL DDL note: InnoDB DDL statements (CREATE TABLE, ALTER TABLE) are NOT
# transactional — MySQL issues an implicit commit before each DDL. A failed
# migration may leave the schema partially applied. Migrations must be additive
# and safe to re-run (use IF NOT EXISTS / IF EXISTS guards where applicable).
# See CLAUDE.md standing rules: "Migrations must be additive and backwards-compatible."
compose run --rm migrate

# ── §5: Deploy ────────────────────────────────────────────────────────────────

log "§5 — deploying"
compose up -d

# ── §6: Health check ──────────────────────────────────────────────────────────

log "§6 — health check"
if _health_check 120; then
  log "deploy complete — $GIT_SHA is live"
else
  _rollback
fi
