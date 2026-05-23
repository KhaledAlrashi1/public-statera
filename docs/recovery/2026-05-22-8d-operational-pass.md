# Resume handoff — public-statera, 8d operational pass (2026-05-22/23)

Paste this entire message at the start of your next conversation. CLAUDE.md is the source of truth for migration state; this file captures the 8d commissioning session of 2026-05-22/23 that CLAUDE.md will not have fully absorbed, plus open decisions and investigation leads for the next session.

---

## Session of 2026-05-22/23 — what was done

**Goal:** execute the 8d operational pass — push a trigger commit, confirm test→build-push→deploy all green, verify the deploy landed on the server, exercise the rollback path via workflow_dispatch.

**Outcome:** partial. Pipeline mechanics verified through §3 (image pull). §4 (secrets plumbing to docker compose) fails reproducibly. Rollback test not reached.

### Completed in this session

1. **GitHub Actions secrets corrected.** Initial secret names (CI_SSH_KEY, DEPLOY_KNOWN_HOSTS, GHCR_TOKEN) did not match the workflow's references (DEPLOY_SSH_KEY). Operator deleted and recreated; final state: DEPLOY_SSH_KEY, DEPLOY_HOST, DEPLOY_USER only. GITHUB_TOKEN is built-in.

2. **Production server repo cloned.** `~/statera/` existed but was empty — bootstrap.sh §6 (clone) was removed in daec3d1 and never replaced. Manual clone: `git clone https://github.com/KhaledAlrashi1/public-statera.git ~/statera` as the deploy user. Verified: `ls ~/statera/deploy/deploy.sh`, `git log -1`, clean working tree, all files owned deploy:deploy.

3. **authorized_keys command= restriction installed.** The CI deploy pubkey (`statera-ci-deploy`, fingerprint `SHA256:84cq3zx8nd/...`) was in `authorized_keys` as a bare entry (no `command=`). This caused sshd to open a plain shell; SendEnv=DEPLOY_SHA was silently dropped; deploy.sh never ran; deploy jobs reported green falsely. Replaced with the full restricted entry from DEPLOY.md §2: `command="bash /home/deploy/statera/deploy/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 ... statera-ci-deploy`. Backup at `authorized_keys.bak.1779482355`.

4. **Short-SHA rev-parse fix shipped** (commit `bc3e300`). `workflow_dispatch` passes `inputs.sha` verbatim; a short SHA like `893b6a3` flows to `docker pull` which returns "not found" because GHCR only tags full SHAs. Fixed by resolving `GIT_SHA` via `git rev-parse --verify "${GIT_SHA}^{commit}"` after `git fetch` in deploy.sh §1.

5. **§4 secrets-plumbing fix shipped** (follow-up commit, same session). `ENV_VARS=$(sops -d ...)` silently swallows sops failure under `set -e` — bash `VAR=$(cmd)` assignments always exit 0, bypassing `set -e`. Empty `ENV_VARS` causes all Compose `${VAR}` interpolations to resolve to empty strings; MySQL refuses to start. Fixed: decrypt to a temp file in `/dev/shm` (RAM-backed, never touches disk), explicit `if ! sops ...; then die; fi`, EXIT trap cleanup. `compose()` and `_rollback()` updated to `--env-file "$ENV_FILE"`.

6. **Pipeline mechanics confirmed working through §3.** With all fixes in place: forced command fires, DEPLOY_SHA arrives via AcceptEnv, rev-parse expands the SHA, `docker pull` succeeds.

7. **Diagnostic step committed and reverted** (commit `4320cb6`, reverted in same session). Confirmed DEPLOY_SSH_KEY contains the correct key fingerprint.

### Not done

- **Rollback path test** (workflow_dispatch with a previous SHA). Deferred until a clean end-to-end deploy completes.
- **Orphaned pre-rotation operator pubkey prune.** Still deferred from the 2026-05-22 key-rotation session. Line 1 of `authorized_keys` is still the pre-rotation key (no comment, fingerprint `SHA256:VkHYe2dEjGB2MrvGuQZ91ihWzBIJ/Hi7V7Rwg5I3uxo`).

---

## Open decisions for the next session

**1. Confirm §4 fix worked — verify clean deploy**

After the §4 fix commit is pushed, the next CI run should produce a full green deploy. Verify:
```bash
ssh statera-prod 'curl -sf localhost:3000/health'
```
Expected: JSON with `version` field matching the deployed SHA.

**2. Exercise the rollback path**

Once a clean deploy is confirmed, trigger `workflow_dispatch` with a short SHA (e.g. `893b6a3`) to exercise the rev-parse expansion and rollback path. Then forward-deploy to HEAD.

**3. Orphaned pre-rotation operator pubkey prune**

Line 1 of `/home/deploy/.ssh/authorized_keys` is still the pre-rotation operator pubkey (no comment, fingerprint `SHA256:VkHYe2dEjGB2MrvGuQZ91ihWzBIJ/Hi7V7Rwg5I3uxo`). Its private half is the orphaned `id_ed25519_statera` on the laptop. Recommendation from prior session: prune.

**4. Auth log review (low priority)**

During commissioning, several SSH connections with the bare CI key opened plain shells before `command=` was installed. Worth reviewing with `sudo journalctl -u ssh` once sudo access is available to confirm no unexpected access.

**5. Module 8e (TLS + Caddy) is the next planned module** after 8d is fully closed. Pre-decisions are documented in CLAUDE.md (apex architecture, Caddyfile at `deploy/Caddyfile`, CSP report-only-first).

---

## Suggested opening prompt for the next session

> Resuming public-statera deployment work. Read CLAUDE.md first.
>
> Context: 8d operational pass is partially complete as of 2026-05-22/23. The §4 secrets-plumbing fix (decrypt to /dev/shm temp file, explicit sops error handling) was committed at the end of the last session. The CI run for that commit is expected to be the first clean end-to-end deploy.
>
> Full session details: docs/recovery/2026-05-22-8d-operational-pass.md
>
> Tasks for this session, in order:
>
> 1. Confirm the §4 fix CI run was green: `ssh statera-prod 'curl -sf localhost:3000/health'` and verify the SHA.
> 2. Exercise the rollback path via workflow_dispatch with a short SHA (e.g. `893b6a3`). Confirm rev-parse expansion, rollback lands, then forward-deploy to HEAD.
> 3. Prune the orphaned pre-rotation operator pubkey from server authorized_keys (line 1, no comment, fingerprint SHA256:VkHYe2dE...). Show diff of authorized_keys before editing.
> 4. Update CLAUDE.md to mark 8d fully complete.
> 5. Begin 8e planning (TLS + Caddy) — read the existing pre-decisions in CLAUDE.md and propose an implementation order.
>
> Standing rules apply. Propose before implementing. Pause before each commit.
