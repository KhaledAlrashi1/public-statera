#!/usr/bin/env bash

# Open Banking skeleton end-to-end curl demo.
#
# Prerequisites:
#   - ENABLE_OPEN_BANKING=true
#   - Backend running on port 5001 (or set BASE)
#
# Usage:
#   bash scripts/demo_open_banking.sh

set -euo pipefail

BASE="${BASE:-http://localhost:5001}"
COOKIE_JAR="$(mktemp /tmp/bank-demo-cookies.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd curl
require_cmd python3

pretty_json() {
  python3 -m json.tool
}

read_json() {
  local expr="$1"
  python3 -c "import json,sys; d=json.load(sys.stdin); print($expr)"
}

echo "=== 1) Fetch CSRF token ==="
CSRF="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$BASE/api/csrf-token" | read_json "d.get('csrf_token','')")"
if [[ -z "$CSRF" ]]; then
  echo "Failed to fetch CSRF token." >&2
  exit 1
fi
echo "CSRF: $CSRF"

echo
echo "=== 2) Register user ==="
REGISTER_EMAIL="bankdemo.$(date +%s)@example.com"
curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -d "{\"email\":\"$REGISTER_EMAIL\",\"password\":\"Demo1234!\",\"first_name\":\"Bank\",\"last_name\":\"Demo\"}" \
  | pretty_json
echo "Registered: $REGISTER_EMAIL"

echo
echo "=== 3) Refresh CSRF token ==="
CSRF="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$BASE/api/csrf-token" | read_json "d.get('csrf_token','')")"
if [[ -z "$CSRF" ]]; then
  echo "Failed to refresh CSRF token." >&2
  exit 1
fi
echo "CSRF: $CSRF"

echo
echo "=== 4) Login ==="
curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -d "{\"email\":\"$REGISTER_EMAIL\",\"password\":\"Demo1234!\"}" \
  | pretty_json

echo
echo "=== 5) Refresh CSRF after login ==="
CSRF="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$BASE/api/csrf-token" | read_json "d.get('csrf_token','')")"
if [[ -z "$CSRF" ]]; then
  echo "Failed to refresh CSRF token after login." >&2
  exit 1
fi
echo "CSRF: $CSRF"

echo
echo "=== 6) Connect FakeBank ==="
CONNECT="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/bank/connect" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -d '{"provider":"fakebank","institution_name":"Demo Fake Bank"}')"
echo "$CONNECT" | pretty_json
CONN_ID="$(echo "$CONNECT" | read_json "d.get('data',{}).get('connection',{}).get('id','')")"
if [[ -z "$CONN_ID" ]]; then
  echo "Could not parse connection id from connect response." >&2
  exit 1
fi
echo "Connection ID: $CONN_ID"

echo
echo "=== 7) List connections ==="
curl -sS -b "$COOKIE_JAR" "$BASE/api/bank/connections" | pretty_json

echo
echo "=== 8) Sync preview (first 5 rows) ==="
PREVIEW="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/bank/connections/$CONN_ID/sync-preview" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -d '{"limit":5}')"
echo "$PREVIEW" | pretty_json
RUN_ID="$(echo "$PREVIEW" | read_json "d.get('data',{}).get('sync_run_id','')")"
if [[ -z "$RUN_ID" ]]; then
  echo "Could not parse sync_run_id from preview response." >&2
  exit 1
fi
echo "Sync Run ID: $RUN_ID"

echo
echo "=== 9) Commit sync run ==="
curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/bank/connections/$CONN_ID/sync-runs/$RUN_ID/commit" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -d '{"default_category":"Uncategorized"}' \
  | pretty_json

echo
echo "=== 10) List connections (last_synced_at should be set) ==="
curl -sS -b "$COOKIE_JAR" "$BASE/api/bank/connections" | pretty_json

echo
echo "=== 11) Revoke connection ==="
curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/bank/connections/$CONN_ID/revoke" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -d '{}' \
  | pretty_json

echo
echo "=== 12) Attempt sync after revoke (expect 409) ==="
curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/bank/connections/$CONN_ID/sync-preview" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: $CSRF" \
  -d '{}' \
  | pretty_json

echo
echo "=== Done ==="
