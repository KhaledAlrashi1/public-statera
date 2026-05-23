#!/usr/bin/env bash
# deploy/deploy-bootstrap.sh — thin bootstrap wrapper for deploy.sh
#
# Invoked by CI over SSH via authorized_keys command= restriction. Responsibility:
# resolve DEPLOY_SHA to a full commit SHA, update the working tree to that commit,
# then exec the just-checked-out deploy.sh.
#
# Fixes two ordering traps in the previous single-script design:
#   1. deploy.sh self-update: bash loads the script at SSH open time; exec replaces
#      the process with the freshly checked-out version of deploy.sh.
#   2. Secrets read before checkout: deploy.sh decrypts $SECRETS_FILE at startup;
#      by the time it runs, git reset --hard has already updated the file.
#
# This script is intentionally stable and thin. All deployment logic lives in
# deploy.sh. This script should almost never need changing. If it does, the update
# must be applied manually on the server — it cannot self-update via CI.
#
# Manual use:
#   DEPLOY_SHA=<sha> bash ~/statera/deploy/deploy-bootstrap.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

GIT_SHA="${GIT_SHA:-${DEPLOY_SHA:-}}"
GIT_SHA="${GIT_SHA:?GIT_SHA (or DEPLOY_SHA) is required}"

cd "$REPO_DIR"

echo "[bootstrap] fetching origin"
git fetch origin

if ! GIT_SHA=$(git rev-parse --verify "${GIT_SHA}^{commit}" 2>/dev/null); then
  echo "[bootstrap] ERROR: '${GIT_SHA}' does not resolve to a commit" >&2
  echo "[bootstrap]   - check that the SHA exists on the remote and was fetched" >&2
  echo "[bootstrap]   - check for typos if invoked via workflow_dispatch" >&2
  exit 1
fi
echo "[bootstrap] SHA resolved: $GIT_SHA"

git reset --hard "$GIT_SHA"
echo "[bootstrap] worktree at $GIT_SHA — exec deploy.sh"

export GIT_SHA
exec bash "$REPO_DIR/deploy/deploy.sh"
