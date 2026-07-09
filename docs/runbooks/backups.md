# Backups runbook

## Overview

Daily encrypted MySQL backups to Cloudflare R2 (`statera-prod-db-backups`).

| Prefix | Lifecycle | Description |
|---|---|---|
| `daily/` | 14 days | Every backup run |
| `weekly/` | 56 days | Sunday runs only |
| `monthly/` | 365 days | 1st-of-month runs only |

**Pipeline:** `mysqldump --single-transaction --databases "${MYSQL_DATABASE}" | zstd -T0 -12 | age -R .sops.yaml-recipients → /dev/shm → rclone copy → R2` — the DB name is **env-sourced** (`${MYSQL_DATABASE}`; production value `statera_prod`), never a hardcoded literal (`backup-db.sh:101`).

**Encryption:** age, recipients derived from `.sops.yaml` at runtime (both operator + server keys). Updating `.sops.yaml` for a key rotation automatically updates backup encryption on the next run — no change to this script needed.

**Status:** 8f-1 DONE (backup creation verified). 8f-2 restore drill pending — backups are not DR-confirmed until a restore succeeds.

---

## Monitoring

```bash
# Last run logs
journalctl -u statera-backup.service -n 100

# Next scheduled fire
systemctl status statera-backup.timer

# All timers
systemctl list-timers statera-backup.timer
```

### 8f-3 — Uptime + backup dead-man

Two independent monitors watch two **different** failure classes. They are not redundant:

| Monitor | Watches | Failure it catches | Would it have caught F1 (dead timer)? |
|---|---|---|---|
| **Healthchecks.io** (dead-man) | *absence* of a success ping | backup failed **or never ran** | **Yes** — no ping ⇒ alarm |
| **UptimeRobot** (prober) | app liveness at the edge | site / API down | **No** — the app was healthy the whole 37 days |

The F1 incident (backups dead 37 days, undetected) is exactly why the dead-man exists: a
prober hitting `/healthz` shows all-green while the backup silently never runs. Only an
**absence-alerting** check catches "the job never ran."

#### Backup dead-man — Healthchecks.io

`backup-db.sh` pings `${HEALTHCHECK_PING_URL}` **only at the very end**, after the encrypted
object is verified in R2 (`backup-db.sh:151-161`). Any earlier failure — or the timer never
firing — means **no ping**, which is what trips the check.

- **Schedule mode:** cron (mirrors the timer exactly; not a bare "1 day" period).
- **Cron:** `30 2 * * *` · **Timezone:** `UTC` · **Grace:** `60 min`.
- **Schedule/grace math** (against `statera-backup.timer`: `OnCalendar=*-*-* 02:30:00 UTC`, `RandomizedDelaySec=300`, `.service` `TimeoutStartSec=1800`):
  - Timer fires 02:30:00–02:35:00 UTC; success ping arrives ≈ **02:30–03:05 UTC** worst case (jitter + up-to-30-min runtime; today the dump completes in seconds).
  - Expected ping 02:30, deadline **03:30 UTC**. Worst-case 03:05 < 03:30 ⇒ **25 min headroom**, no flapping.
  - No ping by 03:30 (job failed after start, **or the timer is dead — F1**) ⇒ check DOWN ⇒ email. Next day's success re-arms the window.
  - Grace is 60 (not 30) for margin as the DB grows + `curl --retry 3` + clock skew, while still tripping within ~1h of a miss (vs. 37 days).
- **Telemetry, never a gate:** the ping runs under `|| WARN`, so a ping-service outage cannot fail a backup that already landed in R2. The success log line is **URL-free** ("Healthcheck pinged OK") — the ping URL embeds a secret UUID and must never reach journald.

#### App uptime — UptimeRobot

Two HTTP(S) monitors, probing **`/healthz` and `/readyz` only** — never `/health`, which
falls through Caddy's SPA fallback to `index.html` and returns 200 even when the API is down
(the 8e health-path trap; `Caddyfile:31` `@probes` excludes `/health`).

- `https://staterafinance.app/healthz` — expect HTTP 200
- `https://staterafinance.app/readyz` — expect HTTP 200
- **Interval:** 5 min (free-tier floor; paid 1-min buys nothing at this scale).
- **Alert threshold:** notify after **2 consecutive failed checks** (anti-flap: a single transient blip is ignored; a real outage alerts within ~5–10 min).
- **Channel:** email to the operator.

#### Operator account setup (operator-run — same seam as the drill)

1. **Healthchecks.io** (free tier: 20 checks, cron schedules, email — need 1):
   - Create a project → new check → **Schedule = Cron**, expression `30 2 * * *`, timezone `UTC`, grace `60 min`.
   - Copy the check's ping URL and store it in sops as `HEALTHCHECK_PING_URL` (see the sops step below). Do **not** paste it into a ticket, chat, or commit — it is a bearer secret.
   - Add the operator email as the notification channel.
2. **UptimeRobot** (free tier: 50 monitors, 5-min, email — need 2):
   - Two HTTP(S) monitors on `/healthz` and `/readyz` as above, 5-min interval, 2-fail threshold, email alert to the operator.
3. **sops** — add `HEALTHCHECK_PING_URL=<the-hc-ping-url>` to `secrets/.env.prod.sops.yaml`, redeploy/re-source. The var is sourced automatically by `backup-db.sh:42-48`; it is deliberately **absent** from the required-var loop (`backup-db.sh:51-54`) so an unset value is a clean no-op. Confirm `deploy/.env.prod.example` carries a documented `HEALTHCHECK_PING_URL=` line (add if missing).

#### Verification — both paths must actually fire (done-condition, not optional)

An alert that has never fired is the 8e silent-rot lesson in a new hat. 8f-3 is not DONE until
**both** induced-absence tests below have produced a real email.

1. **Positive path:** after the first 02:30 UTC run (or a manual `bash backup-db.sh`), confirm the Healthchecks.io check is green and both UptimeRobot probes are up.
2. **Dead-man induced-absence** (the F1 shape, without waiting 24h): temporarily set the check's schedule to a short period/grace (e.g. simple period 5 min / grace 1 min), **skip one ping** — confirm the DOWN email arrives within ~6 min — then restore cron `30 2 * * *` / grace 60 min.
3. **Prober induced-absence:** temporarily point one UptimeRobot monitor at `https://staterafinance.app/api/nonexistent` for one cycle, confirm the DOWN email, then revert to `/healthz`.
   - **Why this exact path (do not "simplify" back to `/healthz-nope`):** any non-`/api/*`, non-probe path — including `/healthz-nope` — is served by Caddy's SPA fallback and returns **HTTP 200** (`index.html`). A 200 can never trip a down-detection test. `/api/*` is proxied to Hono, which returns a genuine 404 for an unmounted route. (Keyword-mode on the `/healthz` JSON body is an equivalent alternative.)

---

## Manual run

```bash
# As deploy user on the production server:
bash /home/deploy/statera/deploy/backup-db.sh
```

---

## One-time server setup (new server from bootstrap)

rclone is included in bootstrap.sh §1 from commit bce4227. On the current production server it was installed manually (2026-05-31):

```bash
# Verify rclone is installed
rclone --version

# Install/update systemd units (as root)
cp /home/deploy/statera/deploy/systemd/statera-backup.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now statera-backup.timer
systemctl list-timers statera-backup.timer
```

---

## DR preconditions

Before these backups are DR-valid, confirm **both**:

1. **Operator age private key** (`age1rf548rfn2hqklfj5nc7slxaym8w0wzmkhrrh7c20ja0sv76lxyds5rzera`) is backed up in a location that survives simultaneous loss of the production server AND the operator's laptop. Without this, a server-loss event leaves every backup permanently unrecoverable.
2. **8f-2 restore drill** has been completed successfully. Backup existence is not proof of restorability.

---

## 8f-2 restore drill procedure

**Scope & isolation.** The drill restores a real R2 backup into a **throwaway scratch MySQL
container** on the production server — never into the live database. It decrypts with the
**server** age key so production PII never leaves the box, and it runs read-only against the
live DB exactly once (the Stage 3 tombstone export). Restoring into production is not a drill,
it is an incident — see "Incident variant" below. All steps are **operator-run** (they touch
production credentials, the server age key, and PII, which stay in operator hands per the
`.claude/settings.json` deny rules).

**Tooling** (committed, reviewed): `deploy/restore-drill.sh` (Stage 0 + Stage 1 + resource
guard + teardown), `deploy/restore-repurge.ts` (Stage 2 + Stage 3, a thin CLI over the tested
`apps/api/src/lib/restore-repurge-lib.ts`).

**Object selection (A1).** The full-drill `--object` MUST be a backup dated **before 2026-07-07
14:13:42 UTC** (the operator's real account-deletion tombstone). That makes Stage 3 a **known-answer test**: exactly **one**
real tombstone match (the operator's `email_hash`) must be found and re-purged — **zero or two-plus
matches = drill failure**. The `--object` / `--verify-only` argument accepts either a **bare name**
(the mode default prefix — `daily/` for `--object`, `monthly/` for `--verify-only` — is prepended)
or a **full prefix path** used verbatim (`weekly/…`, `monthly/…`, `daily/…`); a `/` in the value
selects verbatim mode. That is how you point the drill at a non-default prefix.

> **2026-07-08 state.** The backup timer was not installed until 2026-07-08, so at first drill the
> only object pre-dating the deletion is a **`weekly/`** one
> (`weekly/statera-2026-05-31T21:13:56Z.sql.zst.age`). Run the full drill against that weekly object
> (`--object weekly/…`), and `--verify-only` the fresh `daily/` object as the decrypt check. The
> **`monthly/`-verify step is WAIVED until the first monthly object exists (1 Aug 2026)** — none
> exist yet.

**Operator-run seam — source env for the manual commands.** Three steps here need environment that
the *scripts* self-source via sops but an *interactive shell* does not: object listing (rclone needs
`RCLONE_CONFIG_R2_*` + R2 creds, below), the tombstone export (`MYSQL_ROOT_PASSWORD`, Step 3a), and
the UTC frame (Step 3b). Same class of gap, same seam — `restore-drill.sh` decrypts secrets itself;
your shell must be told explicitly. Source once before the manual `rclone` object-listing commands
(backup-db.sh env-sourcing pattern — temp file, non-evaluating line-by-line export so secret values
with shell metacharacters are never re-interpreted). **This is a plain fenced block on purpose — copy
it straight into the terminal; there are no `> ` prefixes to strip:**

```bash
cd ~/statera
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
ENVTMP="$(mktemp --tmpdir=/dev/shm 2>/dev/null || mktemp)"
trap 'shred -u "$ENVTMP" 2>/dev/null || rm -f "$ENVTMP"' EXIT
sops -d --output-type dotenv secrets/.env.prod.sops.yaml > "$ENVTMP"
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  key="${line%%=*}"; val="${line#*=}"
  [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
  export "$key=$val"
done < "$ENVTMP"
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ENDPOINT="$R2_S3_ENDPOINT" \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
# List candidates across prefixes and pick your objects (pass the full prefix path to the drill):
rclone lsf R2:"$R2_BUCKET"/weekly/    # known-answer object (before 2026-07-07 14:13:42 UTC)
rclone lsf R2:"$R2_BUCKET"/daily/     # fresh daily (verify-only decrypt check)
rclone lsf R2:"$R2_BUCKET"/monthly/   # (none until 1 Aug 2026)
```

`restore-drill.sh` re-sources its own secrets, so this shell env is only for the manual `rclone`
listing and the Stage-3 tombstone export. Because the block above exports the **entire** prod dotenv
line-by-line, `MYSQL_ROOT_PASSWORD` is already in your shell — so if you sourced here, **Step 3a is
already satisfied** (its re-export is an idempotent no-op) and the whole set is `unset`/torn down in
teardown.

### Stage 0 + 1 — pull, decrypt, restore, verify (operator, on the server)

```bash
cd ~/statera
# Full drill — known-answer object pre-dating the 2026-07-07 14:13:42 UTC deletion. Pass the full prefix path
# (weekly/, since the daily timer was only installed 2026-07-08). --anchor-email optional:
bash deploy/restore-drill.sh --object weekly/statera-2026-05-31T21:13:56Z.sql.zst.age --anchor-email you@example.com
# Decrypt check on the fresh daily object (Stage 0 only, no restore):
bash deploy/restore-drill.sh --verify-only daily/statera-2026-07-08T15:23:03Z.sql.zst.age
# The monthly/ decrypt check is WAIVED until the first monthly object exists (1 Aug 2026).
```

`restore-drill.sh` asserts (fails loudly, never "completed without errors"): object + decrypted
`sha256` recorded; a complete dump (`-- Dump completed` trailer, truncation guard); the restored
table set equals the **declared 21-table set** exactly, both directions (A2 — no discover-and-accept);
a per-table row-count manifest; FK-integrity probes = 0 orphaned owned rows; and (if given) exactly
one active anchor user. It leaves the scratch container **running** and prints `T_backup` + the
scratch connection string for Stage 2/3. A **resource guard (A4)** aborts before creating the
container if free memory/disk are below `MIN_FREE_MEM_MB` (512) / `MIN_FREE_DISK_MB` (2048).

**T_backup is UTC — confirm it before Stage 3.** Object names are produced by `date -u` in
`backup-db.sh`, so the printed `T_backup` is UTC and carries a trailing `Z` (e.g.
`2026-07-05T02:30:00Z`). Keep this exact ISO-`Z` form for the CLI `--t-backup` (the CLI parses it
as UTC). Verify the `Z` is present before proceeding — a `T_backup` without it is ambiguous and
must not be used. Stage 3 compares this instant against UTC-stored `created_at`; the frame check
below closes the loop.

### Stage 2 — deterministic gate check (operator, against the scratch container)

This host runs Node **only inside Docker** (no host-level toolchain, by design), so the
`restore-repurge.ts` CLI runs in a `node:22-alpine` container. `restore-drill.sh` already prints
the fully-resolved command (scratch password, `${MYSQL_DATABASE}` = `statera_prod`, wrapper and
all) in its Stage-1 PASS banner — **copy it from there.** Shown here for shape (replace `PW` with
the printed scratch password; note the **absolute `/repo` path** — `pnpm exec` chdirs to `apps/api`,
so a relative `deploy/…` path breaks):

```bash
docker run --rm --network host -v ~/statera:/repo -v /dev/shm:/dev/shm -w /repo node:22-alpine \
  sh -c "corepack enable && pnpm install --frozen-lockfile --filter statera-api && \
    pnpm --filter statera-api exec tsx /repo/deploy/restore-repurge.ts \
      --mode fixture --url 'mysql://root:PW@127.0.0.1:3307/statera_prod' --t-backup 'T_BACKUP'"
```

Inserts a synthetic user A (tombstone at `T_backup+1s` → must purge) and user B (tombstone at
`T_backup-1s` → must survive), runs the gate + `purgeUserAccountRows`, and asserts **exact**
outcomes: A's owned rows → 0 across all 13 purge tables and A soft-deleted; B untouched. Fixture
emails use the `.invalid` TLD so they can never collide with a real prod tombstone.

### Stage 3 — real-data known-answer re-purge (operator)

**3a — source the prod root password via sops** (needed for the read-only export; kept in an env
var, never on a command line, and unset in teardown). **If you already sourced env for the
object-listing seam block above, skip this** — that block exported the full prod dotenv line-by-line,
so `MYSQL_ROOT_PASSWORD` is already set and the re-export below is a harmless no-op:

```bash
cd ~/statera
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
export MYSQL_ROOT_PASSWORD="$(sops -d --output-type dotenv secrets/.env.prod.sops.yaml | sed -n 's/^MYSQL_ROOT_PASSWORD=//p')"
[ -n "$MYSQL_ROOT_PASSWORD" ] || { echo 'ERROR: failed to source MYSQL_ROOT_PASSWORD'; }
```

**3b — UTC-consistency check** (confirm prod stores `created_at` in UTC, so the `>=` boundary
compares like-for-like). This prints the server/session time zone and your own deletion
tombstone's `created_at`; the tombstone time must equal the UTC wall-clock at which you deleted
your account (2026-07-07 14:13:42 UTC). If it is off by whole hours, the DB is not in UTC — **stop** and
reconcile the frame before continuing (adjust `T_BACKUP_SQL` below to the server frame).

```bash
docker compose -f ~/statera/docker-compose.yml exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql \
  mysql -uroot -N -e "SELECT @@global.time_zone, @@session.time_zone, UTC_TIMESTAMP(); \
     SELECT created_at FROM security_events WHERE is_tombstone=1 ORDER BY created_at DESC LIMIT 3;" "$MYSQL_DATABASE"
```

**3c — export production's at-or-after-backup tombstones read-only** (this is the only live-DB
touch; gate is `>=` — a tombstone stamped exactly at `T_backup` must re-purge, since restored data
at that instant can only be pre-deletion). `T_backup` is UTC ISO-`Z`; convert it to a MySQL
datetime literal (drop the `Z`, `T`→space) and emit `created_at` with an explicit `Z` so the CLI
parses it as UTC (a bare MySQL datetime would be read as local time):

```bash
T_BACKUP='2026-07-05T02:30:00Z'                     # the ISO-Z value printed by Stage 1
T_BACKUP_SQL="${T_BACKUP//T/ }"; T_BACKUP_SQL="${T_BACKUP_SQL%Z}"   # → 2026-07-05 02:30:00 (UTC)

docker compose -f ~/statera/docker-compose.yml exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql \
  mysql -uroot -N -e "SET SESSION time_zone='+00:00'; \
    SELECT JSON_OBJECT('email_hash', JSON_UNQUOTE(JSON_EXTRACT(details_json,'\$.email_hash')), \
                       'created_at', CONCAT(DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s'),'Z')) \
     FROM security_events WHERE is_tombstone=1 AND created_at >= '${T_BACKUP_SQL}'" "$MYSQL_DATABASE" \
  | python3 -c 'import sys,json; print(json.dumps([json.loads(l) for l in sys.stdin if l.strip()]))' \
  > /dev/shm/prod-tombstones.json

docker run --rm --network host -v ~/statera:/repo -v /dev/shm:/dev/shm -w /repo node:22-alpine \
  sh -c "corepack enable && pnpm install --frozen-lockfile --filter statera-api && \
    pnpm --filter statera-api exec tsx /repo/deploy/restore-repurge.ts \
      --mode repurge --url 'mysql://root:PW@127.0.0.1:3307/statera_prod' --t-backup '$T_BACKUP' \
      --tombstones /dev/shm/prod-tombstones.json --expect 1"
```

`--expect 1` enforces the known-answer test: the CLI fails unless exactly one restored user
matches (the operator's `email_hash`), then re-purges it and asserts every owned count → 0.

### Teardown (operator)

```bash
bash deploy/restore-drill.sh --teardown          # docker rm -f -v the scratch container; asserts it is gone
shred -u /dev/shm/prod-tombstones.json 2>/dev/null || rm -f /dev/shm/prod-tombstones.json
unset MYSQL_ROOT_PASSWORD                          # clear the sops-sourced prod password from the shell
```

### Incident variant — restoring into PRODUCTION (not a drill)

If a real restore into the live DB is ever required:
1. **Before** overwriting, capture production's current tombstones with `created_at >= T_backup`
   (the restore will wipe them) — same read-only `SELECT` as Stage 3, saved off-box.
2. Restore the decrypted dump into the live DB.
3. Re-purge every captured match with the SAME `purgeUserAccountRows` logic **against production**.
4. **Then, for each re-purged user, call `revokeSessionVersion(userId, oldSv)`** (Redis deny-list)
   — exactly as the production purge callers do (`routes/account.ts` + `worker/jobs/delete-account-job.ts`),
   so any session resurrected by the restore is invalidated. The scratch CLI intentionally omits
   this step (a scratch DB has no live sessions and no Redis); the incident variant MUST include it.

### Execution record (fill on completion — closes 8f-1 + 8f-2)

**Executed 2026-07-08 — ALL STAGES PASS; teardown confirmed.** This record flips 8f-1 →
"DR-confirmed" and closes 8f-2. Handoff: `docs/recovery/2026-07-08-8f2-restore-drill.md`.

**Recorded deviations.** The full-drill target is a `weekly/` object, not a `daily/` one — the
backup timer was not installed until 2026-07-08 (see fix-forward F1), so the only object
pre-dating the 2026-07-07 14:13:42 UTC deletion was the 8f-1 smoke-run weekly. The `monthly/`
decrypt-verify was **WAIVED** (no monthly objects exist until 2026-08-01); the fresh `daily/`
object was substituted as the second-object readability check.

**Stage 0 — full-drill object** `weekly/statera-2026-05-31T21:13:56Z.sql.zst.age`
- object sha256 `212ce4f797da62caa197ad458315a9233fea04ee37bf0f259b9ac763072adfdb`
- decrypted sha256 `7c4bdb1b95813007ba2b6a79c73ccea9417c5460b0eb6817bc2c0abf6a3d2dd3`, 45698 bytes
- **identical sha256s across three independent pulls** → deterministic decrypt confirmed
- `T_backup` = `2026-05-31T21:13:56Z`

**Stage 0 — second-object readability (replaces the waived monthly check)**
`daily/statera-2026-07-08T15:23:03Z.sql.zst.age`
- object sha256 `efde78e1570fc5e100176aeabc5166335823229214ea422ba854506e6bab7d34`
- decrypted sha256 `21c9075ba27ad8755b8d7ffeabe772d54dd9df12e92fe2a4947f2b39c9a643b6`, 51050 bytes
- Stage 0 PASS — today's backup is **content-verified**, not merely present.

**Stage 1 — restore + verify** (third attempt, on `dde1dfb`'s TCP probe): **PASS.**
- Attempt history: **2002** (post-init restart gap) → **1045** (pre-password temp init server) →
  **PASS** — both symptoms of the one mysql:8 init race, cured by the TCP probe (F4 / `dde1dfb`).
- Declared **21-table set exact**, both directions. Row-count manifest:
  `budgets 1, categories 5, dashboard_snapshots 3, debt_accounts 3, __drizzle_migrations 4`
  (0000–0003 all present — schema-vintage question resolved),
  `memorized_transactions 6, merchants 6, product_events 14, savings_goals 3, security_events 4,`
  `transactions 5, user_profiles 1, users 3, worker_task_runs 8`; all bank/token/feedback tables 0.
- FK-integrity probes: **0** orphaned owned rows. Anchor (`alrashidi.kha@gmail.com`) = **exactly 1**.

**Stage 2 — deterministic gate check (fixture): PASS.** Post-backup fixture user purged
(`categories` 1→0); pre-backup fixture untouched (`categories` 1→1). **Honestly:** the fixture
populates only `categories`, so the other 12 purge tables were exercised **0→0 (vacuous)**. What
Stage 2 tested was the timestamp **gate boundary** (the unit under test); `purgeUserAccountRows`
itself carries its own unit + integration coverage (`account-deletion*.test.ts`).

**Stage 3 — real-data known-answer re-purge: PASS.** Prod tombstone export (the only live-DB
touch, read-only) returned **exactly 1** entry (`created_at 2026-07-07T14:13:42Z`, `email_hash
47f9a50daf0ced9a2d84c31ab6298e1527cb1e1a29beb0334881607f59ef1a6c`). Re-purge matched **exactly 1**
(`userId=1`). Owned rows before → after:
`{transactions 5, budgets 1, dashboard_snapshots 1, debt_accounts 3, savings_goals 3,`
`product_events 10, memorized_transactions 6, user_profiles 1, merchants 6, categories 5, rest 0}`
**→ ALL 0** after; the tombstone **survived**. Privacy §7's re-deletion-on-restore commitment is now
drilled with a known-answer proof.

**UTC frame check:** `@@global.time_zone` / `@@session.time_zone` = `SYSTEM`; `UTC_TIMESTAMP()`
matched wall-clock UTC; the `>=` gate compared same-frame.

**Teardown:** confirmed — scratch container gone, `/dev/shm/prod-tombstones.json` shredded.

> **Still open — DR precondition #1 (operator age key escrowed offsite) is NOT proven by this
> drill.** Stage 0 proves the key works today, not that it survives simultaneous laptop+server
> loss. Queued under Module 10d as an operator task.

---

## Key rotation impact

When the operator age key is rotated (see `docs/runbooks/key-rotation.md`):
1. Update `.sops.yaml` with the new public key
2. `backup-db.sh` picks up the new recipient automatically on the next run (no script change)
3. Existing backup objects remain encrypted to the old key — they can still be decrypted until the old key is destroyed. Rotate objects if required by policy.
