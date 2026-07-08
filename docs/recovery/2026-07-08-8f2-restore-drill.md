# 8f-2 Restore Drill + 8f-1 Go-live — Close-out — 2026-07-08

Operational session that executed the restore drill end-to-end and, in the
process, discovered and remediated production-state issues (backup timer never
installed; deploy-user sudo escalation untested). Per the operational-work
convention this handoff records what was deliberately NOT done and the open
decisions for the next session. The durable lessons live in CLAUDE.md
`## Module fix-forwards` (F1 dead timer, F2 sudo/VGA recovery, F3 Node-toolchain
drill runner); the execution record lives in `docs/runbooks/backups.md §8f-2`.

## What was done

### The drill (2026-07-08) — ALL STAGES PASS
- Full drill against `weekly/statera-2026-05-31T21:13:56Z.sql.zst.age` (the only
  object pre-dating the 2026-07-07 14:13:42 UTC deletion). Stage 0 (deterministic
  decrypt, three identical pulls) → Stage 1 (21-table exact, FK=0, anchor=1) →
  Stage 2 (gate boundary) → Stage 3 (known-answer re-purge, exactly 1 = userId 1,
  all owned rows → 0, tombstone survived) → teardown confirmed. Full figures in
  the runbook execution record.
- Second-object readability check on the fresh `daily/statera-2026-07-08T15:23:03Z`
  (substituting for the WAIVED monthly check — no monthly object until 2026-08-01).

### Production remediation (same session, root via Hetzner VGA console)
- **Backup timer installed** (`statera-backup.{service,timer}` → `/etc/systemd/system`,
  `daemon-reload`, `enable --now`, manual run fired). Fresh daily landed and was
  content-verified by the drill's Stage 0. Backups were dead for 37 days before this
  (F1). Timer now verified running.
- **Deploy-user sudo escalation fixed** — `/etc/sudoers.d/deploy` with
  `deploy ALL=(ALL) NOPASSWD:ALL`, validated with `visudo -c`, verified from a normal
  SSH session (F2).

### Close-out commit (this commit)
- Runbook execution record filled; stale `statera` DB literal → `${MYSQL_DATABASE}`
  (prod `statera_prod`); §13 pipeline line corrected; Stage 2/3 invocations switched
  to the `node:22-alpine` docker form (F3); deletion-date corrected to
  2026-07-07 14:13:42 UTC.
- `restore-drill.sh` cosmetics: `-e MYSQL_PWD` on in-container execs (kills the
  password-on-command-line warnings), printed "Next" hints switched to the docker form,
  URL-password-deliberate comment.
- CLAUDE.md: F1/F2/F3 fix-forwards, F4 cross-refs; 8f-1 + 8f-2 flipped DONE; 8f-3 moved
  to NEXT in the 10d queue.

## What was deliberately NOT done

### 1. Operator age key offsite escrow — DR precondition #1 (STILL OPEN)
The drill proves the **server** age key decrypts backups today; it does NOT prove the
key survives simultaneous laptop + server loss. Offsite escrow of the operator age key
is unaddressed. Queued under Module 10d as an operator task. Until done, a total-server
loss is unrecoverable even though backups exist in R2.

### 2. Deploy-user password remains unknown/unset
The bootstrap-era (2026-05-15) deploy password was lost and not reset. The recorded
escalation path is now **NOPASSWD sudoers** (F2), not an interactive password. Decision
recorded: acceptable for a single-operator box; revisit if more operators are added.

### 3. F3 optimization (record-only, not built)
The drill runner uses `node:22-alpine` + a fresh `pnpm install` each Stage 2/3 invocation.
The already-present `statera-api` image could be reused to skip the install. Noted in F3;
not implemented (the install cost is a few seconds, once per drill).

## Open decisions

1. **8f-3 scope (NEXT):** wire the dead-man healthcheck ping on the backup timer.
   `backup-db.sh` already has ping plumbing (see its header) — wiring it + an UptimeRobot
   monitor is 8f-3. This is the alert that would have caught F1 on day 1, not day 37.
   Probe `/healthz` + `/readyz` only (never `/health` — see the 8e health-path correction).
2. **§13 bootstrap rewrite** (long-standing) still open — unrelated to this session but
   adjacent to the VGA-console access story.

## Suggested opening prompt for the next session

> 8f-3 (uptime + backup dead-man ping) — NEXT in the 10d queue per the 8f-2 close-out.
> Propose the design: (a) UptimeRobot monitor on `https://staterafinance.app/healthz`
> (and `/readyz`); (b) wire `backup-db.sh`'s existing ping plumbing to a dead-man
> healthcheck so a silent backup-timer failure alerts within one interval (the F1
> gap: backups were dead 37 days undetected). Phase A first: which ping provider,
> what interval, where the ping URL secret lives (sops), and the alert routing.
