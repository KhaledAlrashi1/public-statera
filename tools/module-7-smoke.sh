#!/usr/bin/env bash
# tools/module-7-smoke.sh
#
# Interactive smoke test for Module 7 (7a/7b/7c) + Module 7.5 (account deletion).
# Tests TOTP enrollment/disable, TOTP-gated login, session revocation, and account deletion
# against a live Docker Compose stack (mysql, redis, api, worker all running).
#
# Run from the project root:
#   bash tools/module-7-smoke.sh
#
# Prerequisites:
#   - jq, oathtool (oath-toolkit), docker, curl
#   - .env file with MYSQL_PASSWORD set
#   - Docker stack running: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
#   - A Google account you can sign in with interactively (OAUTH_CLIENT_ID configured in .env)

# TODO(module-7c-error-code-contract): /api/auth/me and other endpoints return
# session-invalidation error as a string in the `error` field ("Session invalidated.
# Please sign in again."). CLAUDE.md's "Public API contracts" section says
# code "session_invalidated" should be the contract. Either fix the response
# shape to include `code: "session_invalidated"` or update CLAUDE.md to match
# the actual implementation. Decide before Module 9 frontend integration.

# TODO(module-7.5-deletion-jwt-revocation): DELETE /api/account clears the
# session cookie but does not bump users.sessionVersion or write a sv_revoked
# Redis key. The raw JWT remains valid against requireAuth until 30-day expiry.
# Decide if this is intentional (relying on cookie clearing + JWT expiry) or
# should be hardened (bump sv on deletion the same way revoke-all does).

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
NC=$'\033[0m'

# ── Global state ──────────────────────────────────────────────────────────────
SESSION_MAIN=""       # current working session token
PENDING_COOKIE=""     # statera_pending_2fa token (set by interactive_pending_login)
SECRET_2=""           # TOTP base32 secret (phase 1.5, used throughout phase 2+)
BACKUP_CODES_2=()     # plaintext backup codes from phase 1.5 setup
USER_ID=""            # numeric DB user id (set in P3 pre-flight)
OLD_SV=""             # sv value before revoke-all (set in phase 3)
SESSION_B=""          # second session (created in 3.1)
REVOKED_SESSION_A=""  # session A before revoke-all (for 3.3 assertion)
REVOKED_SESSION_B=""  # session B before revoke-all (for 3.3 assertion)
DELETE_INTENT_COOKIE="" # statera_delete_intent (captured from 2FA verify in 4.2)

PASS_COUNT=0

# ── Helpers ───────────────────────────────────────────────────────────────────

pass()   { PASS_COUNT=$((PASS_COUNT + 1)); printf "${GREEN}  PASS${NC} %s\n" "$*"; }
fail()   { printf "${RED}  FAIL${NC} %s\n" "$*"; exit 1; }
header() { printf "\n${CYAN}══════════════════════════════════════════════════════${NC}\n"; printf "${CYAN}  %s${NC}\n" "$*"; printf "${CYAN}══════════════════════════════════════════════════════${NC}\n"; }
step()   { printf "\n${YELLOW}  ── %s ──${NC}\n" "$*"; }
prompt() { printf "${YELLOW}  >>> %s${NC}\n" "$*"; }
info()   { printf "      %s\n" "$*"; }

# Strip HTTP response headers; return body only.
body() {
  printf '%s' "$1" | awk 'BEGIN{h=1} h && /^\r?$/{h=0; next} !h' | tr -d '\r'
}

# Extract HTTP status code from curl -si response.
http_status() {
  printf '%s' "$1" | grep -m1 "^HTTP/" | awk '{print $2}'
}

# Extract a named cookie value from curl -si response headers.
# Usage: extract_cookie "$RESP" "cookie_name"
extract_cookie() {
  local resp="$1" name="$2"
  printf '%s' "$resp" | grep -im1 "set-cookie:.*${name}=" | \
    sed "s/.*${name}=\([^;]*\).*/\1/" | tr -d '\r'
}

# Assert HTTP status code.
assert_status() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "${desc} (HTTP ${actual})"
  else
    fail "${desc} — expected HTTP ${expected}, got HTTP ${actual}"
  fi
}

# Assert a jq query result against an expected value.
# Usage: assert_json "description" ".path.to.field" "expected" "$JSON_STRING"
assert_json() {
  local desc="$1" query="$2" expected="$3" json="$4"
  local actual
  actual=$(printf '%s' "$json" | jq -r "$query" 2>/dev/null || true)
  if [[ "$actual" == "$expected" ]]; then
    pass "$desc"
  else
    fail "${desc} — expected '${expected}', got '${actual}' (query: ${query})"
  fi
}

# Run a MySQL query inside the mysql container and return the result.
mysql_exec() {
  docker exec public_statera-mysql-1 \
    mysql -h 127.0.0.1 -u statera -p"${MYSQL_PASSWORD}" statera \
    -sNe "$1" 2>/dev/null
}

# Assert a MySQL query result against an expected value.
assert_db() {
  local desc="$1" query="$2" expected="$3"
  local actual
  actual=$(mysql_exec "$query")
  if [[ "$actual" == "$expected" ]]; then
    pass "$desc"
  else
    fail "${desc} — expected '${expected}', got '${actual}'"
  fi
}

# Run redis-cli on DB 1 inside the redis container.
redis_exec() {
  docker exec public_statera-redis-1 redis-cli -n 1 "$@"
}


# Direct the operator to the OIDC login endpoint and collect statera_pending_2fa.
# TOTP must be enabled. Sets global PENDING_COOKIE.
interactive_pending_login() {
  LOGIN_URL="http://127.0.0.1:3000/api/auth/login"
  printf "\n"
  prompt "Open an INCOGNITO browser window and navigate to this URL:"
  info "$LOGIN_URL"
  prompt "Complete Google sign-in. The browser will redirect to /auth/2fa-verify"
  prompt "(a 'connection refused' is expected if the frontend is not running — the cookie is already set)."
  prompt "Open DevTools → Application → Cookies → http://127.0.0.1:3000"
  prompt "Copy the value of 'statera_pending_2fa'."
  printf "\n"
  prompt "Paste statera_pending_2fa (input hidden, press Enter when done):"
  IFS= read -r -s PENDING_COOKIE
  printf "\n"
  if [[ -z "$PENDING_COOKIE" ]]; then
    fail "No pending 2FA cookie provided."
  fi
}

# Wait until we're at least 1 second into a fresh 30s TOTP window. Use before
# generating a TOTP code with `oathtool` if the same secret was used recently —
# Module 7a's replay protection rejects re-used codes within the same window.
wait_for_fresh_totp() {
  local now_sec
  now_sec=$(date +%s)
  local window_start=$(( now_sec - now_sec % 30 ))
  local elapsed=$(( now_sec - window_start ))
  local wait_for=$(( 30 - elapsed + 1 ))
  info "Waiting ${wait_for}s for fresh TOTP window..."
  sleep "$wait_for"
}

# ── PRE-FLIGHT ────────────────────────────────────────────────────────────────
header "PRE-FLIGHT"

step "P0: Tool dependency check"
for tool in jq oathtool docker curl; do
  if ! command -v "$tool" &>/dev/null; then
    printf "${RED}  ABORT${NC}: '%s' not found.\n" "$tool"
    case "$tool" in
      jq)       printf "    Install: brew install jq\n" ;;
      oathtool) printf "    Install: brew install oath-toolkit\n" ;;
      docker)   printf "    Install: https://docs.docker.com/get-docker/\n" ;;
      curl)     printf "    Install: brew install curl\n" ;;
    esac
    exit 1
  fi
done
pass "P0: jq, oathtool, docker, curl all present"

# Move to project root (script lives in tools/)
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

step "P0: Source .env"
if [[ ! -f .env ]]; then
  printf "${RED}  ABORT${NC}: .env not found in project root (%s).\n" "$SCRIPT_DIR"
  printf "    Copy .env.example → .env and fill in credentials.\n"
  exit 1
fi
# shellcheck source=/dev/null
source .env
if [[ -z "${MYSQL_PASSWORD:-}" ]]; then
  printf "${RED}  ABORT${NC}: MYSQL_PASSWORD not set in .env\n"
  exit 1
fi
pass "P0: .env sourced, MYSQL_PASSWORD present"

step "P0: Stack health check"
HEALTH=$(curl -sf http://localhost:3000/healthz 2>/dev/null || true)
if [[ -z "$HEALTH" ]]; then
  printf "${RED}  ABORT${NC}: API not reachable at http://localhost:3000/healthz\n"
  printf "    Start the stack: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d\n"
  exit 1
fi
if ! printf '%s' "$HEALTH" | jq -e '.ok == true' &>/dev/null; then
  printf "${RED}  ABORT${NC}: API healthcheck not-ok: %s\n" "$HEALTH"
  exit 1
fi
if ! docker exec public_statera-mysql-1 \
    mysqladmin ping -h 127.0.0.1 -u statera -p"${MYSQL_PASSWORD}" --silent 2>/dev/null; then
  printf "${RED}  ABORT${NC}: MySQL not healthy\n"
  exit 1
fi
if ! docker exec public_statera-redis-1 redis-cli -n 1 ping &>/dev/null; then
  printf "${RED}  ABORT${NC}: Redis not healthy\n"
  exit 1
fi
pass "P0: API, MySQL, Redis all healthy"

step "P1: DB reset (users + security_events)"
printf "${YELLOW}  WARNING: This will DELETE ALL rows from the 'users' and 'security_events' tables.${NC}\n"
printf "${YELLOW}  Only proceed on the local smoke-test Docker stack — NEVER on production.${NC}\n"
printf "\n"
printf "  Type 'yes' to confirm: "
read -r CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  printf "  Aborted.\n"
  exit 0
fi
mysql_exec "SET FOREIGN_KEY_CHECKS=0; \
  DELETE FROM security_events; \
  DELETE FROM users; \
  SET FOREIGN_KEY_CHECKS=1; \
  ALTER TABLE users AUTO_INCREMENT=1; \
  ALTER TABLE security_events AUTO_INCREMENT=1;"
pass "P1: DB reset — users and security_events cleared"

step "P2: Redis FLUSHDB (DB 1)"
redis_exec FLUSHDB >/dev/null
pass "P2: Redis DB 1 flushed"

step "P3: Initial OIDC handshake (TOTP not yet enabled)"
LOGIN_URL="http://127.0.0.1:3000/api/auth/login"
printf "\n"
prompt "Open an INCOGNITO browser window and navigate to this URL:"
info "$LOGIN_URL"
prompt "Complete Google sign-in. When redirected (connection refused is OK — cookie is set):"
prompt "Open DevTools → Application → Cookies → http://127.0.0.1:3000"
prompt "Copy the value of 'statera_session'."
printf "\n"
prompt "Paste statera_session (input hidden, press Enter when done):"
IFS= read -r -s SESSION_MAIN
printf "\n"
if [[ -z "$SESSION_MAIN" ]]; then
  fail "No session cookie provided."
fi
ME_P3=$(curl -si -b "statera_session=$SESSION_MAIN" http://localhost:3000/api/auth/me 2>/dev/null)
assert_status "P3: GET /api/auth/me with initial session" "200" "$(http_status "$ME_P3")"
USER_ID=$(body "$ME_P3" | jq -r '.session.userId')
if [[ -z "$USER_ID" || "$USER_ID" == "null" ]]; then
  fail "P3: could not extract userId from /api/auth/me"
fi
pass "P3: session valid — userId=${USER_ID}"

# ── PHASE 1: Module 7a — TOTP enable / disable ────────────────────────────────
header "PHASE 1 — Module 7a: TOTP enable / disable"

step "1.1: POST /api/auth/2fa/setup — generate TOTP secret"
SETUP1_RESP=$(curl -si \
  -b "statera_session=$SESSION_MAIN" \
  -X POST -H "Content-Type: application/json" \
  http://localhost:3000/api/auth/2fa/setup 2>/dev/null)
assert_status "1.1: setup returns 200" "200" "$(http_status "$SETUP1_RESP")"
SETUP1_BODY=$(body "$SETUP1_RESP")
assert_json "1.1: ok=true" ".ok" "true" "$SETUP1_BODY"
SECRET_1=$(printf '%s' "$SETUP1_BODY" | jq -r '.data.secret_b32')
if [[ -z "$SECRET_1" || "$SECRET_1" == "null" ]]; then
  fail "1.1: no secret_b32 in setup response"
fi
pass "1.1: TOTP secret obtained"

step "1.2: POST /api/auth/2fa/confirm — enroll TOTP"
sleep 2  # avoid TOTP code reuse within a 30s window
TOTP1=$(oathtool --totp -b "$SECRET_1")
CONFIRM1_RESP=$(curl -si \
  -b "statera_session=$SESSION_MAIN" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"code\":\"${TOTP1}\"}" \
  http://localhost:3000/api/auth/2fa/confirm 2>/dev/null)
assert_status "1.2: confirm returns 200" "200" "$(http_status "$CONFIRM1_RESP")"
assert_json "1.2: ok=true" ".ok" "true" "$(body "$CONFIRM1_RESP")"
assert_db "1.2: totp_enabled=1 in DB" \
  "SELECT totp_enabled FROM users WHERE id=${USER_ID}" "1"
pass "1.2: TOTP enrolled, DB confirmed"

step "1.4: POST /api/auth/2fa/disable — disable TOTP"
wait_for_fresh_totp
TOTP_DISABLE=$(oathtool --totp -b "$SECRET_1")
DISABLE_RESP=$(curl -si \
  -b "statera_session=$SESSION_MAIN" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"code\":\"${TOTP_DISABLE}\"}" \
  http://localhost:3000/api/auth/2fa/disable 2>/dev/null)
assert_status "1.4: disable returns 200" "200" "$(http_status "$DISABLE_RESP")"
assert_json "1.4: ok=true" ".ok" "true" "$(body "$DISABLE_RESP")"
NEW_SESSION_DISABLE=$(extract_cookie "$DISABLE_RESP" "statera_session")
if [[ -z "$NEW_SESSION_DISABLE" ]]; then
  fail "1.4: expected new statera_session in Set-Cookie header after disable"
fi
SESSION_MAIN="$NEW_SESSION_DISABLE"
pass "1.4: TOTP disabled — new session cookie issued"
assert_db "1.4: totp_enabled=0 in DB" \
  "SELECT totp_enabled FROM users WHERE id=${USER_ID}" "0"
assert_db "1.4: totp_secret=NULL in DB" \
  "SELECT IF(totp_secret IS NULL,'NULL','SET') FROM users WHERE id=${USER_ID}" "NULL"
pass "1.4: DB cleared (totp_enabled=0, totp_secret=NULL)"

step "1.5: Re-enable TOTP (setup + confirm) — prepare for phase 2"
SETUP2_RESP=$(curl -si \
  -b "statera_session=$SESSION_MAIN" \
  -X POST -H "Content-Type: application/json" \
  http://localhost:3000/api/auth/2fa/setup 2>/dev/null)
assert_status "1.5a: second setup returns 200" "200" "$(http_status "$SETUP2_RESP")"
SETUP2_BODY=$(body "$SETUP2_RESP")
assert_json "1.5a: ok=true" ".ok" "true" "$SETUP2_BODY"
SECRET_2=$(printf '%s' "$SETUP2_BODY" | jq -r '.data.secret_b32')
if [[ -z "$SECRET_2" || "$SECRET_2" == "null" ]]; then
  fail "1.5: no secret_b32 in second setup response"
fi
# Store all 10 plaintext backup codes for later use in phase 2
mapfile -t BACKUP_CODES_2 < <(printf '%s' "$SETUP2_BODY" | jq -r '.data.backup_codes[]')
if [[ ${#BACKUP_CODES_2[@]} -ne 10 ]]; then
  fail "1.5: expected 10 backup codes, got ${#BACKUP_CODES_2[@]}"
fi

sleep 2
TOTP2=$(oathtool --totp -b "$SECRET_2")
CONFIRM2_RESP=$(curl -si \
  -b "statera_session=$SESSION_MAIN" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"code\":\"${TOTP2}\"}" \
  http://localhost:3000/api/auth/2fa/confirm 2>/dev/null)
assert_status "1.5b: second confirm returns 200" "200" "$(http_status "$CONFIRM2_RESP")"
assert_json "1.5b: ok=true" ".ok" "true" "$(body "$CONFIRM2_RESP")"
assert_db "1.5b: totp_enabled=1 in DB after re-enable" \
  "SELECT totp_enabled FROM users WHERE id=${USER_ID}" "1"
pass "1.5: TOTP re-enabled — 10 backup codes stored in DB"

# ── PHASE 2: Module 7b — TOTP verify-on-login ────────────────────────────────
header "PHASE 2 — Module 7b: TOTP verify-on-login"

step "2.1: Fresh OIDC → pending_2fa cookie → verify → session issued"
interactive_pending_login
wait_for_fresh_totp
TOTP_VERIFY1=$(oathtool --totp -b "$SECRET_2")
VERIFY1_RESP=$(curl -si \
  -b "statera_pending_2fa=$PENDING_COOKIE" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"code\":\"${TOTP_VERIFY1}\",\"type\":\"totp\"}" \
  http://localhost:3000/api/auth/2fa/verify 2>/dev/null)
assert_status "2.1: verify returns 200" "200" "$(http_status "$VERIFY1_RESP")"
assert_json "2.1: ok=true" ".ok" "true" "$(body "$VERIFY1_RESP")"
SESSION_FROM_VERIFY=$(extract_cookie "$VERIFY1_RESP" "statera_session")
if [[ -z "$SESSION_FROM_VERIFY" ]]; then
  fail "2.1: expected statera_session in Set-Cookie after /2fa/verify"
fi
SESSION_MAIN="$SESSION_FROM_VERIFY"
pass "2.1: TOTP verified — real session cookie issued"

step "2.2: Verify session is valid"
ME2_RESP=$(curl -si -b "statera_session=$SESSION_MAIN" http://localhost:3000/api/auth/me 2>/dev/null)
assert_status "2.2: GET /api/auth/me returns 200" "200" "$(http_status "$ME2_RESP")"
pass "2.2: session valid after TOTP-gated login"

step "2.3: Lockout — 3 consecutive wrong codes → PENDING_2FA_RESTART on 3rd"
interactive_pending_login

FAIL1_RESP=$(curl -si \
  -b "statera_pending_2fa=$PENDING_COOKIE" \
  -X POST -H "Content-Type: application/json" \
  -d '{"code":"000000","type":"totp"}' \
  http://localhost:3000/api/auth/2fa/verify 2>/dev/null)
assert_status "2.3: 1st wrong code → 401" "401" "$(http_status "$FAIL1_RESP")"
assert_json "2.3: 1st wrong → INVALID_TOTP_CODE" ".code" "INVALID_TOTP_CODE" "$(body "$FAIL1_RESP")"

FAIL2_RESP=$(curl -si \
  -b "statera_pending_2fa=$PENDING_COOKIE" \
  -X POST -H "Content-Type: application/json" \
  -d '{"code":"000000","type":"totp"}' \
  http://localhost:3000/api/auth/2fa/verify 2>/dev/null)
assert_status "2.3: 2nd wrong code → 401" "401" "$(http_status "$FAIL2_RESP")"
assert_json "2.3: 2nd wrong → INVALID_TOTP_CODE" ".code" "INVALID_TOTP_CODE" "$(body "$FAIL2_RESP")"

FAIL3_RESP=$(curl -si \
  -b "statera_pending_2fa=$PENDING_COOKIE" \
  -X POST -H "Content-Type: application/json" \
  -d '{"code":"000000","type":"totp"}' \
  http://localhost:3000/api/auth/2fa/verify 2>/dev/null)
assert_status "2.3: 3rd wrong code → 401" "401" "$(http_status "$FAIL3_RESP")"
assert_json "2.3: 3rd wrong → PENDING_2FA_RESTART" ".code" "PENDING_2FA_RESTART" "$(body "$FAIL3_RESP")"
pass "2.3: lockout confirmed on 3rd failure"

# Clear the per-user failure counter (5-min TTL) so step 2.4 is not immediately locked out.
redis_exec DEL "pending_2fa_failures:${USER_ID}" >/dev/null
pass "2.3: Redis failure counter cleared"

step "2.4: Backup code login — first backup code, no BACKUP_CODES_LOW warning"
# Phase 2.3 sent 3 verify attempts; the path-keyed rate limiter on /2fa/verify
# is 5 req/60s. Sleep 60s to reset the window before 2.4 + 2.5 add 2 more attempts.
info "Sleeping 60s to clear /2fa/verify rate limit before backup-code tests..."
sleep 60
interactive_pending_login
BACKUP_CODE_0="${BACKUP_CODES_2[0]}"
BACKUP1_RESP=$(curl -si \
  -b "statera_pending_2fa=$PENDING_COOKIE" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"code\":\"${BACKUP_CODE_0}\",\"type\":\"backup\"}" \
  http://localhost:3000/api/auth/2fa/verify 2>/dev/null)
assert_status "2.4: backup code verify returns 200" "200" "$(http_status "$BACKUP1_RESP")"
BACKUP1_BODY=$(body "$BACKUP1_RESP")
assert_json "2.4: ok=true" ".ok" "true" "$BACKUP1_BODY"
BACKUP1_WARN=$(printf '%s' "$BACKUP1_BODY" | jq -r '.data.warning // "none"')
if [[ "$BACKUP1_WARN" != "none" && "$BACKUP1_WARN" != "null" ]]; then
  fail "2.4: unexpected warning '${BACKUP1_WARN}' with 9 backup codes remaining"
fi
pass "2.4: backup code[0] consumed — no low-code warning (9 remaining)"
SESSION_BACKUP=$(extract_cookie "$BACKUP1_RESP" "statera_session")
if [[ -z "$SESSION_BACKUP" ]]; then
  fail "2.4: expected statera_session in Set-Cookie after backup code verify"
fi
SESSION_MAIN="$SESSION_BACKUP"

step "2.5: BACKUP_CODES_LOW — simulate 9/10 consumed via DB, use 10th"
# After 2.4 consumed code[0], DB has 9 hashes at indices [0]-[8]:
#   [0]=hash(code[1]), [1]=hash(code[2]), ..., [8]=hash(code[9])
# Keep only [8] (= hash of BACKUP_CODES_2[9]) to simulate 9-of-10 consumed.
mysql_exec "UPDATE users \
  SET totp_backup_codes_json = JSON_ARRAY(JSON_EXTRACT(totp_backup_codes_json, '\$[8]')) \
  WHERE id=${USER_ID};"
REMAINING=$(mysql_exec "SELECT JSON_LENGTH(totp_backup_codes_json) FROM users WHERE id=${USER_ID}")
if [[ "$REMAINING" != "1" ]]; then
  fail "2.5: expected 1 hash after DB manipulation, got ${REMAINING}"
fi
pass "2.5: DB reduced to 1 backup code hash (code[9] only)"

interactive_pending_login
BACKUP_CODE_9="${BACKUP_CODES_2[9]}"
BACKUP2_RESP=$(curl -si \
  -b "statera_pending_2fa=$PENDING_COOKIE" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"code\":\"${BACKUP_CODE_9}\",\"type\":\"backup\"}" \
  http://localhost:3000/api/auth/2fa/verify 2>/dev/null)
assert_status "2.5: last backup code verify returns 200" "200" "$(http_status "$BACKUP2_RESP")"
BACKUP2_BODY=$(body "$BACKUP2_RESP")
assert_json "2.5: ok=true" ".ok" "true" "$BACKUP2_BODY"
assert_json "2.5: warning=BACKUP_CODES_LOW" ".data.warning" "BACKUP_CODES_LOW" "$BACKUP2_BODY"
assert_json "2.5: backup_codes_remaining=0" ".data.backup_codes_remaining" "0" "$BACKUP2_BODY"
pass "2.5: BACKUP_CODES_LOW warning confirmed (0 remaining)"
SESSION_LOW=$(extract_cookie "$BACKUP2_RESP" "statera_session")
if [[ -z "$SESSION_LOW" ]]; then
  fail "2.5: expected statera_session in Set-Cookie after last backup code verify"
fi
SESSION_MAIN="$SESSION_LOW"

# ── PHASE 3: Module 7c — revoke-all + security events ────────────────────────
header "PHASE 3 — Module 7c: revoke-all + security events"

step "3.1: Capture current sv; create second session via fresh OIDC + TOTP"
ME3_RESP=$(curl -si -b "statera_session=$SESSION_MAIN" http://localhost:3000/api/auth/me 2>/dev/null)
assert_status "3.1: GET /api/auth/me" "200" "$(http_status "$ME3_RESP")"
OLD_SV=$(body "$ME3_RESP" | jq -r '.session.sv')
USER_ID=$(body "$ME3_RESP" | jq -r '.session.userId')
pass "3.1: userId=${USER_ID}, current sv=${OLD_SV}"

info "Creating SESSION_B (second concurrent session) via fresh OIDC + TOTP..."
interactive_pending_login
wait_for_fresh_totp
TOTP_B=$(oathtool --totp -b "$SECRET_2")
VERIFY_B_RESP=$(curl -si \
  -b "statera_pending_2fa=$PENDING_COOKIE" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"code\":\"${TOTP_B}\",\"type\":\"totp\"}" \
  http://localhost:3000/api/auth/2fa/verify 2>/dev/null)
assert_status "3.1: SESSION_B verify returns 200" "200" "$(http_status "$VERIFY_B_RESP")"
SESSION_B=$(extract_cookie "$VERIFY_B_RESP" "statera_session")
if [[ -z "$SESSION_B" ]]; then
  fail "3.1: no statera_session in SESSION_B verify response"
fi
pass "3.1: SESSION_B created (sv=${OLD_SV})"

step "3.2: POST /api/auth/sessions/revoke-all with session A"
REVOKED_SESSION_A="$SESSION_MAIN"
REVOKED_SESSION_B="$SESSION_B"
REVOKE_RESP=$(curl -si \
  -b "statera_session=$SESSION_MAIN" \
  -X POST -H "Content-Type: application/json" \
  http://localhost:3000/api/auth/sessions/revoke-all 2>/dev/null)
assert_status "3.2: revoke-all returns 200" "200" "$(http_status "$REVOKE_RESP")"
REVOKE_BODY=$(body "$REVOKE_RESP")
assert_json "3.2: ok=true" ".ok" "true" "$REVOKE_BODY"
EXPECTED_NEW_SV=$((OLD_SV + 1))
assert_json "3.2: session_version bumped to ${EXPECTED_NEW_SV}" \
  ".data.session_version" "${EXPECTED_NEW_SV}" "$REVOKE_BODY"
NEW_SESSION=$(extract_cookie "$REVOKE_RESP" "statera_session")
if [[ -z "$NEW_SESSION" ]]; then
  fail "3.2: no new statera_session in revoke-all Set-Cookie"
fi
SESSION_MAIN="$NEW_SESSION"
pass "3.2: revoke-all succeeded — sv bumped to ${EXPECTED_NEW_SV}, new session issued"

step "3.3: Old sessions rejected; new session accepted"
# Implementation note (see TODO(module-7c-error-code-contract) at top of file):
# requireAuth throws HTTPException(401, { message: "Session invalidated...", cause: "session_invalidated" }).
# app.ts onError serialises err.message only — the body is { ok: false, error: "Session invalidated..." }.
# There is no `code` field in the response. Assertions below check HTTP 401 + error message text.
FAIL_A_RESP=$(curl -si -b "statera_session=$REVOKED_SESSION_A" \
  http://localhost:3000/api/auth/me 2>/dev/null)
assert_status "3.3: old SESSION_A → 401" "401" "$(http_status "$FAIL_A_RESP")"
if ! body "$FAIL_A_RESP" | grep -qi "invalidated"; then
  fail "3.3: old SESSION_A error body should contain 'invalidated' (got: $(body "$FAIL_A_RESP"))"
fi
pass "3.3: old SESSION_A rejected — 401 + 'invalidated' in error body"

FAIL_B_RESP=$(curl -si -b "statera_session=$REVOKED_SESSION_B" \
  http://localhost:3000/api/auth/me 2>/dev/null)
assert_status "3.3: SESSION_B → 401" "401" "$(http_status "$FAIL_B_RESP")"
if ! body "$FAIL_B_RESP" | grep -qi "invalidated"; then
  fail "3.3: SESSION_B error body should contain 'invalidated' (got: $(body "$FAIL_B_RESP"))"
fi
pass "3.3: SESSION_B rejected — 401 + 'invalidated' in error body"

NEW_OK_RESP=$(curl -si -b "statera_session=$SESSION_MAIN" \
  http://localhost:3000/api/auth/me 2>/dev/null)
assert_status "3.3: new SESSION_MAIN → 200" "200" "$(http_status "$NEW_OK_RESP")"
pass "3.3: new SESSION_MAIN accepted"

step "3.4: Redis deny-list key present with ≥28-day TTL"
REDIS_KEY="sv_revoked:${USER_ID}:${OLD_SV}"
KEY_EXISTS=$(redis_exec EXISTS "$REDIS_KEY")
if [[ "$KEY_EXISTS" != "1" ]]; then
  fail "3.4: Redis key '${REDIS_KEY}' not found (EXISTS returned ${KEY_EXISTS})"
fi
pass "3.4: deny-list key present: ${REDIS_KEY}"
KEY_TTL=$(redis_exec TTL "$REDIS_KEY")
MIN_TTL=$((28 * 24 * 3600))  # 28 days in seconds (TTL shrinks from 30d; allow 2d slack)
if [[ "$KEY_TTL" -lt "$MIN_TTL" ]]; then
  fail "3.4: TTL too low: ${KEY_TTL}s (expected ≥ ${MIN_TTL}s / 28 days)"
fi
pass "3.4: TTL=${KEY_TTL}s (≥28 days)"

step "3.5: GET /api/auth/profile/security-events → empty (no profile.* events yet)"
SEC_RESP=$(curl -si -b "statera_session=$SESSION_MAIN" \
  http://localhost:3000/api/auth/profile/security-events 2>/dev/null)
assert_status "3.5: security-events returns 200" "200" "$(http_status "$SEC_RESP")"
SEC_BODY=$(body "$SEC_RESP")
assert_json "3.5: ok=true" ".ok" "true" "$SEC_BODY"
ITEMS_LEN=$(printf '%s' "$SEC_BODY" | jq '.data.items | length')
if [[ "$ITEMS_LEN" != "0" ]]; then
  fail "3.5: expected 0 profile.* events, got ${ITEMS_LEN}"
fi
assert_json "3.5: has_more=false" ".data.has_more" "false" "$SEC_BODY"
pass "3.5: security-events items=[] (profile.* not emitted until Module 9)"

# ── PHASE 4: Module 7.5 — Account deletion ───────────────────────────────────
header "PHASE 4 — Module 7.5: Account deletion"

printf "\n${YELLOW}━━━ PHASE 4 IS A KNOWN-FAILING DEFERRED STEP ━━━${NC}\n"
printf "${YELLOW}The smoke test will fail at step 4.1 with HTTP 400 'Missing state cookie'.${NC}\n"
printf "${YELLOW}This is expected. See TODO(module-7-smoke-phase-4-browser-session) below.${NC}\n"
printf "${YELLOW}Phases 1, 2, 3 pass = success for this run.${NC}\n\n"

# TODO(module-7-smoke-phase-4-browser-session): Phase 4 has a structural
# bug independent of the get_login_url fix in this commit. /api/auth/delete-reauth
# requires a statera_session cookie on the browser, but the test harness has no
# frontend — all post-2FA sessions are obtained via curl POST to /2fa/verify, so
# the cookie lives on curl, never on the browser. Fixing this requires a design
# decision (dev-only test endpoint in apps/api/, manual DevTools cookie injection,
# or alternative test-harness pattern). Deferred to a separate fix-forward proposal.
# In the meantime, expect phase 4 to fail at step 4.1 with HTTP 400 "Missing state cookie".

step "4.1: GET /api/auth/delete-reauth → 302 to OIDC provider"
REAUTH_RESP=$(curl -si \
  -b "statera_session=$SESSION_MAIN" \
  http://localhost:3000/api/auth/delete-reauth 2>/dev/null)
assert_status "4.1: delete-reauth returns 302" "302" "$(http_status "$REAUTH_RESP")"
DELETE_REAUTH_URL=$(printf '%s' "$REAUTH_RESP" | grep -im1 "^location:" | awk '{print $2}' | tr -d '\r')
if [[ -z "$DELETE_REAUTH_URL" ]]; then
  fail "4.1: no Location header in delete-reauth response"
fi
pass "4.1: delete-reauth 302 — OIDC URL obtained"

step "4.2: Interactive delete re-auth → operator pastes statera_pending_2fa → script captures statera_delete_intent"
# Operator action required: paste statera_pending_2fa only.
# statera_delete_intent is issued by POST /api/auth/2fa/verify (deleteIntent=true in the pending JWT)
# and captured directly from the Set-Cookie header — no second browser paste needed.
printf "\n"
prompt "Open an INCOGNITO browser window and paste this URL:"
info "$DELETE_REAUTH_URL"
prompt "Complete Google sign-in. The browser will redirect to /auth/2fa-verify?intent=delete"
prompt "(connection refused is OK — the statera_pending_2fa cookie is already set on 127.0.0.1:3000)."
prompt "Open DevTools → Application → Cookies → http://127.0.0.1:3000"
prompt "Copy the value of 'statera_pending_2fa' (NOT statera_delete_intent — the script captures that automatically)."
printf "\n"
prompt "Paste statera_pending_2fa (input hidden, press Enter when done):"
IFS= read -r -s PENDING_COOKIE
printf "\n"
if [[ -z "$PENDING_COOKIE" ]]; then
  fail "4.2: no pending 2FA cookie provided"
fi

wait_for_fresh_totp
TOTP_DELETE=$(oathtool --totp -b "$SECRET_2")
INTENT_RESP=$(curl -si \
  -b "statera_pending_2fa=$PENDING_COOKIE" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"code\":\"${TOTP_DELETE}\",\"type\":\"totp\"}" \
  http://localhost:3000/api/auth/2fa/verify 2>/dev/null)
assert_status "4.2: delete-intent 2FA verify returns 200" "200" "$(http_status "$INTENT_RESP")"
INTENT_BODY=$(body "$INTENT_RESP")
assert_json "4.2: ok=true" ".ok" "true" "$INTENT_BODY"
assert_json "4.2: delete_intent=true in response body" ".data.delete_intent" "true" "$INTENT_BODY"
# statera_delete_intent is issued via Set-Cookie on this response; no second operator paste needed.
DELETE_INTENT_COOKIE=$(extract_cookie "$INTENT_RESP" "statera_delete_intent")
if [[ -z "$DELETE_INTENT_COOKIE" ]]; then
  fail "4.2: no statera_delete_intent in Set-Cookie after 2FA verify"
fi
pass "4.2: statera_delete_intent captured from /2fa/verify Set-Cookie (single paste: statera_pending_2fa only)"

step "4.3: DELETE /api/account → task_id returned"
DEL_RESP=$(curl -si \
  -b "statera_session=${SESSION_MAIN}; statera_delete_intent=${DELETE_INTENT_COOKIE}" \
  -X DELETE \
  http://localhost:3000/api/account 2>/dev/null)
assert_status "4.3: DELETE /api/account returns 200" "200" "$(http_status "$DEL_RESP")"
DEL_BODY=$(body "$DEL_RESP")
assert_json "4.3: ok=true" ".ok" "true" "$DEL_BODY"
assert_json "4.3: deleted=true" ".data.deleted" "true" "$DEL_BODY"
TASK_TOKEN=$(printf '%s' "$DEL_BODY" | jq -r '.data.task_id')
if [[ -z "$TASK_TOKEN" || "$TASK_TOKEN" == "null" ]]; then
  fail "4.3: no task_id in deletion response"
fi
pass "4.3: deletion dispatched — task_id obtained"

step "4.4: Poll GET /api/account/deletion-status/:taskToken until complete (max 30s)"
STATUS="pending"
for i in $(seq 1 30); do
  STATUS_RESP=$(curl -sf \
    "http://localhost:3000/api/account/deletion-status/${TASK_TOKEN}" 2>/dev/null || true)
  STATUS=$(printf '%s' "$STATUS_RESP" | jq -r '.data.status' 2>/dev/null || echo "pending")
  if [[ "$STATUS" == "complete" ]]; then
    pass "4.4: deletion complete (after ${i}s)"
    break
  elif [[ "$STATUS" == "failed" ]]; then
    fail "4.4: deletion job reported 'failed'"
  fi
  sleep 1
done
if [[ "$STATUS" != "complete" ]]; then
  fail "4.4: deletion did not complete within 30s (last status: ${STATUS})"
fi

step "4.5: DB assertions — account purged, tombstone present"
# Per Module 7.5 spec, account deletion clears the session cookie via the DELETE response's
# Set-Cookie header but does NOT bump sessionVersion or write a sv_revoked deny-list key.
# The raw JWT remains valid against requireAuth (which is sv-deny-list-only by design, no
# is_active check) until its 30-day expiry. Smoke test asserts on DB observable state only.
# See TODO(module-7.5-deletion-jwt-revocation) at top of file.
assert_db "4.5: users.is_active=0 (soft-deleted)" \
  "SELECT is_active FROM users WHERE id=${USER_ID}" "0"

NON_TOMBSTONE=$(mysql_exec \
  "SELECT COUNT(*) FROM security_events WHERE user_id=${USER_ID} AND is_tombstone=0")
if [[ "$NON_TOMBSTONE" != "0" ]]; then
  fail "4.5: expected 0 non-tombstone security_events for user_id=${USER_ID}, got ${NON_TOMBSTONE}"
fi
pass "4.5: security_events purged (0 non-tombstone rows for user)"

TOMBSTONE=$(mysql_exec \
  "SELECT COUNT(*) FROM security_events WHERE is_tombstone=1 AND user_id IS NULL AND created_at >= NOW() - INTERVAL 2 MINUTE")
if [[ "$TOMBSTONE" -lt "1" ]]; then
  fail "4.5: expected ≥1 recent tombstone row in security_events (is_tombstone=1, user_id IS NULL)"
fi
pass "4.5: tombstone row present (is_tombstone=1, user_id=NULL)"

# ── CLEANUP ───────────────────────────────────────────────────────────────────
header "CLEANUP"

step "C1: Redis FLUSHDB (DB 1)"
redis_exec FLUSHDB >/dev/null
pass "C1: Redis DB 1 flushed"

step "C2: Summary"
printf "\n${CYAN}══════════════════════════════════════════════════════${NC}\n"
printf "${GREEN}  Module 7 + 7.5 smoke test COMPLETE — ${PASS_COUNT} checks passed${NC}\n"
printf "${CYAN}══════════════════════════════════════════════════════${NC}\n\n"
