# Handoff — public-statera, 8d operational pass completion (2026-05-23)

This document records the second and final session of the 8d commissioning arc.
The first session (2026-05-22/23) is at:
  docs/recovery/2026-05-22-8d-operational-pass.md

At the start of that doc, the outcome was "partial" — pipeline mechanics verified
through §3 but §4 (secrets plumbing) failing. This session resolved all remaining
blockers and completed forward-deploy + rollback test end-to-end. 8d is closed.

---

## Commit timeline — complete 8d arc

### Session 1 (2026-05-22 — partial pass, see prior doc)

| Commit  | Description |
|---------|-------------|
| 1b53243 | phase-3: 8d — initial CI/CD commit |
| 1bd02f0 | phase-3: 8d — GHCR namespace typo fix (khaledalrashidi1→khaledalrashi1) |
| 893b6a3 | phase-3: 8d — first pipeline run (operational pass trigger) |
| bc3e300 | phase-3: 8d follow-up — resolve short SHA via git rev-parse in deploy.sh |
| 4320cb6 | phase-3: 8d diagnostic — print DEPLOY_SSH_KEY fingerprint (temporary) |
| 656bce8 | phase-3: 8d — partial close, revert diagnostic, handoff doc |
| d3c8e7c | phase-3: 8d follow-up — decrypt to temp file with explicit sops error handling |

### Session 2 (2026-05-23 — full pass, this doc)

| Commit  | Description |
|---------|-------------|
| 5d3dbef | phase-3: 8d trigger — exercise §4 fix in CI |
| a62a6b6 | phase-3: 8d follow-up — URL-safe MYSQL_PASSWORD + correct registry/repo split in compose |
| 79e19ba | phase-3: 8d structural fix — thin bootstrap wrapper resolves git-reset-after-read trap |
| 7874184 | phase-3: 8d trigger — exercise post-credential-rotation deploy |
| e1decfb | phase-3: 8d workflow — resolve short SHAs before checkout (resolve-sha job) |
| b0e413b | phase-3: 8d workflow — fix stale comment referencing deploy.sh |
| 625bda8 | phase-3: 8d — close-out and CLAUDE.md update |

---

## What was resolved in this session

**1. §4 secrets plumbing confirmed working (5d3dbef)**

The d3c8e7c temp-file decrypt fix was exercised: 29 vars decrypted to /dev/shm,
secrets reached the Compose environment, MySQL started. §4 unblocked.

**2. MYSQL_PASSWORD URL-safety (a62a6b6)**

Node's `new URL()` parser rejects passwords containing `/`. The initial password
(generated with `openssl rand -base64`) contained `/`, causing `DATABASE_URL`
parse failure at API startup. Rotated via `ALTER USER ... IDENTIFIED BY ...`
on the running MySQL container — no volume drop, no data loss. Pattern established:
always use `openssl rand -hex 32` for connection-URL credentials.

**3. Compose registry/repo embedding bug (a62a6b6)**

`${REGISTRY:-ghcr.io/khaledalrashi1/statera-api}:${GIT_SHA}` dropped `/statera-api`
when `REGISTRY` was set to namespace-only. Fixed by splitting the default:
`${REGISTRY:-ghcr.io/khaledalrashi1}/statera-api:${GIT_SHA}`.

**4. Thin-bootstrap restructure (79e19ba)**

Two traps in the single-script design: (a) bash loads the script at SSH open; a
changed `deploy.sh` in the new commit runs the stale in-memory version; (b) sops
decryption ran before `git reset --hard`, so a rotation commit's new credential
never reached the Compose environment on that deploy cycle. Fix: introduced
`deploy/deploy-bootstrap.sh` as a stable thin wrapper that `authorized_keys
command=` invokes. It does fetch + rev-parse + reset + `exec bash deploy/deploy.sh`.
The `exec` loads the freshly checked-out script and the current secrets file.

The `authorized_keys` `command=` restriction on the server was also updated from
`deploy.sh` to `deploy-bootstrap.sh` — a manual operational edit, not part of
commit 79e19ba; CI cannot and does not modify `authorized_keys` on the server.

**5. actions/checkout short-SHA limitation (e1decfb)**

`actions/checkout ref: 79e19ba` resolves via `git ls-remote` (branch/tag tips
only) — a historical commit not at a ref tip is not found. Added a `resolve-sha`
job before all downstream jobs that uses `gh api repos/{owner}/{repo}/commits/{sha}`
to expand any 7–40 hex char SHA to the full 40-char form, with a regex guard
rejecting branch names and whitespace.

**6. Stale comment cleanup (b0e413b)**

Two comment blocks in deploy.yml still referenced `deploy.sh` after the bootstrap
restructure. Corrected to `deploy-bootstrap.sh`.

---

## Operational state at session close

**Server:** Hetzner CPX31, Helsinki HEL1. IP 89.167.76.236.

**Running image:** `ghcr.io/khaledalrashi1/statera-api:b0e413b825c...` (full SHA
of b0e413b, confirmed via `/health` endpoint and `docker inspect` OCI revision
label).

**Database:** MySQL container healthy, all 20 Drizzle migration tables present,
`drizzle.__drizzle_migrations` shows all migrations applied. No pending migrations.

**authorized_keys** (`/home/deploy/.ssh/authorized_keys`, 3 lines):
- Line 1: pre-rotation operator pubkey (no comment, fingerprint
  `SHA256:VkHYe2dEjGB2MrvGuQZ91ihWzBIJ/Hi7V7Rwg5I3uxo`) — **still present,
  prune deferred (third deferral)**
- Line 2: `statera-operator-20260522` (current operator key)
- Line 3: `command="bash /home/deploy/statera/deploy/deploy-bootstrap.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDfODLG7HNE/YfmsHG3ERyypJje534hX22GZ18jgz+iE statera-ci-deploy`

**GitHub Actions secrets:** `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER` all
set. `GITHUB_TOKEN` built-in.

**Pipeline state:** fully operational. Forward deploy green (push to b0e413b).
Rollback test green (workflow_dispatch sha=79e19ba → redeployed successfully,
then forward deploy back to b0e413b).

**GHCR image retention:** SHA-tagged images verified persistent — rollback to
79e19ba pulled successfully days after that image was first pushed.

---

## Open items

**1. Orphan pre-rotation operator pubkey prune (third deferral)**

Line 1 of `authorized_keys` is still the pre-rotation operator key. Its private
half is on the lost laptop, not in third-party hands, so no acute exposure exists.
Poor hygiene but not blocking. Re-evaluate at start of next session.

The escape hatch + backup + line-scoped sed + wc -l verification protocol is
documented in docs/recovery/2026-05-22-8d-operational-pass.md (open decisions §3).
If shipped, update the operator SSH key bullet in CLAUDE.md and commit as
`phase-3: 8d — orphan operator pubkey prune`.

**2. TODO(module-8d-node24-upgrade)**

Bump pinned action SHAs to Node 24-compatible versions before 2026-06-02 (forced
migration) or 2026-09-16 (Node 20 removal). Currently affected: actions/checkout,
actions/setup-node, pnpm/action-setup, docker/build-push-action,
docker/login-action, docker/setup-buildx-action. Not blocking 8e; can be done
as a standalone commit any session.

**3. TODO(module-8b-§13-rewrite)**

§13 SSH verification in bootstrap.sh has a known false-negative. Not blocking 8e.
Tracked in CLAUDE.md.

---

## Next module: 8e — TLS + reverse proxy

Pre-decisions already made (in CLAUDE.md):
- Apex architecture: staterafinance.app serves frontend (`/`) and API (`/api/*`)
  from one Caddy virtual host
- Caddyfile committed to repo at `deploy/Caddyfile`
- CSP in `Content-Security-Policy-Report-Only` mode first; enforce after ≥1 week
  of production data
- Caddy replaces nginx in docker-compose.prod.yml

8e has not been started. No blocking items from 8d.

---

## Suggested opening prompt for the next session

> Resuming public-statera. Read CLAUDE.md first.
>
> 8d is fully closed as of 2026-05-23. Forward deploy and rollback test both green
> end-to-end. CLAUDE.md reflects the current state.
>
> Full session arc: docs/recovery/2026-05-23-8d-operational-pass-completion.md
> (cross-references the earlier 2026-05-22-8d-operational-pass.md for prior-session
> context).
>
> Before starting 8e, decide on one deferred item:
>
> - Orphan pre-rotation operator pubkey prune (authorized_keys line 1, no comment,
>   fingerprint SHA256:VkHYe2dE...). Third deferral; escape hatch + backup + sed
>   protocol is in docs/recovery/2026-05-22-8d-operational-pass.md §3. Recommended:
>   ship it now as a clean standalone task before 8e adds complexity.
>
> When ready: begin 8e (TLS + Caddy). Pre-decisions are in CLAUDE.md. Starting
> point: read deploy/Caddyfile, read docker-compose.prod.yml (nginx service),
> and propose an implementation order for 8e.
>
> Standing rules apply. Propose before implementing. One commit per logical unit.
