# Backups runbook

## Overview

Daily encrypted MySQL backups to Cloudflare R2 (`statera-prod-db-backups`).

| Prefix | Lifecycle | Description |
|---|---|---|
| `daily/` | 14 days | Every backup run |
| `weekly/` | 56 days | Sunday runs only |
| `monthly/` | 365 days | 1st-of-month runs only |

**Pipeline:** `mysqldump --single-transaction | zstd -T0 -12 | age -R .sops.yaml-recipients → /dev/shm → rclone copy → R2`

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

**Object selection (A1).** The full-drill `--object` MUST be a `daily/` backup dated **before
2026-07-06** (the operator's real account deletion). That makes Stage 3 a **known-answer test**:
exactly **one** real tombstone match (the operator's `email_hash`) must be found and re-purged
— **zero or two-plus matches = drill failure**. Additionally decrypt-verify one `monthly/`
object (Stage 0 only) to prove long-retention objects are still readable.

> **Operator-run seam — source env for the manual commands.** Three steps here need environment
> that the *scripts* self-source via sops but an *interactive shell* does not: object listing
> (rclone needs `RCLONE_CONFIG_R2_*` + R2 creds, below), the tombstone export (`MYSQL_ROOT_PASSWORD`,
> Step 3a), and the UTC frame (Step 3b). Same class of gap, same seam — `restore-drill.sh`
> decrypts secrets itself; your shell must be told explicitly. Source once before the manual
> `rclone` object-listing commands (backup-db.sh env-sourcing pattern — temp file, non-evaluating
> line-by-line export so secret values with shell metacharacters are never re-interpreted):
>
> ```bash
> cd ~/statera
> export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
> ENVTMP="$(mktemp --tmpdir=/dev/shm 2>/dev/null || mktemp)"
> trap 'shred -u "$ENVTMP" 2>/dev/null || rm -f "$ENVTMP"' EXIT
> sops -d --output-type dotenv secrets/.env.prod.sops.yaml > "$ENVTMP"
> while IFS= read -r line || [[ -n "$line" ]]; do
>   [[ -z "$line" || "$line" == \#* ]] && continue
>   key="${line%%=*}"; val="${line#*=}"
>   [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
>   export "$key=$val"
> done < "$ENVTMP"
> export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
>   RCLONE_CONFIG_R2_ENDPOINT="$R2_S3_ENDPOINT" \
>   RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
>   RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
>   RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
> # Now list candidates and pick the two objects:
> rclone lsf R2:"$R2_BUCKET"/daily/ | grep -E 'statera-2026-07-0[1-5]'   # a daily object before 2026-07-06
> rclone lsf R2:"$R2_BUCKET"/monthly/                                    # any monthly object (decrypt check)
> ```
> `restore-drill.sh` re-sources its own secrets, so this shell env is only for the manual `rclone`
> listing; the `MYSQL_ROOT_PASSWORD` for Step 3 is sourced separately in 3a and `unset` in teardown.

### Stage 0 + 1 — pull, decrypt, restore, verify (operator, on the server)

```bash
cd ~/statera
# Full drill (daily object before 2026-07-06). --anchor-email optional (asserts your active user restored):
bash deploy/restore-drill.sh --object statera-2026-07-05T02:30:00Z.sql.zst.age --anchor-email you@example.com
# Long-retention decrypt check (Stage 0 only, no restore):
bash deploy/restore-drill.sh --verify-only statera-2026-07-01T02:30:00Z.sql.zst.age
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

```bash
pnpm --filter statera-api exec tsx "$(git rev-parse --show-toplevel)/deploy/restore-repurge.ts" \
  --mode fixture --url 'mysql://root:PW@127.0.0.1:3307/statera' --t-backup 'T_BACKUP'
```

Inserts a synthetic user A (tombstone at `T_backup+1s` → must purge) and user B (tombstone at
`T_backup-1s` → must survive), runs the gate + `purgeUserAccountRows`, and asserts **exact**
outcomes: A's owned rows → 0 across all 13 purge tables and A soft-deleted; B untouched. Fixture
emails use the `.invalid` TLD so they can never collide with a real prod tombstone.

### Stage 3 — real-data known-answer re-purge (operator)

**3a — source the prod root password via sops** (needed for the read-only export; kept in an env
var, never on a command line, and unset in teardown):

```bash
cd ~/statera
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
export MYSQL_ROOT_PASSWORD="$(sops -d --output-type dotenv secrets/.env.prod.sops.yaml | sed -n 's/^MYSQL_ROOT_PASSWORD=//p')"
[ -n "$MYSQL_ROOT_PASSWORD" ] || { echo 'ERROR: failed to source MYSQL_ROOT_PASSWORD'; }
```

**3b — UTC-consistency check** (confirm prod stores `created_at` in UTC, so the `>=` boundary
compares like-for-like). This prints the server/session time zone and your own deletion
tombstone's `created_at`; the tombstone time must equal the UTC wall-clock at which you deleted
your account (2026-07-06/07). If it is off by whole hours, the DB is not in UTC — **stop** and
reconcile the frame before continuing (adjust `T_BACKUP_SQL` below to the server frame).

```bash
docker compose -f ~/statera/docker-compose.yml exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql \
  mysql -uroot -N -e "SELECT @@global.time_zone, @@session.time_zone, UTC_TIMESTAMP(); \
     SELECT created_at FROM security_events WHERE is_tombstone=1 ORDER BY created_at DESC LIMIT 3;" statera
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
     FROM security_events WHERE is_tombstone=1 AND created_at >= '${T_BACKUP_SQL}'" statera \
  | python3 -c 'import sys,json; print(json.dumps([json.loads(l) for l in sys.stdin if l.strip()]))' \
  > /dev/shm/prod-tombstones.json

pnpm --filter statera-api exec tsx "$(git rev-parse --show-toplevel)/deploy/restore-repurge.ts" \
  --mode repurge --url 'mysql://root:PW@127.0.0.1:3307/statera' --t-backup "$T_BACKUP" \
  --tombstones /dev/shm/prod-tombstones.json --expect 1
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

> TODO(8f-2): after the first drill run, append a dated record here: object used + its `sha256`,
> `T_backup`, the Stage-1 row-count manifest, Stage-2 exact before/after counts, the Stage-3 named
> tombstone match(es), and teardown confirmation. Add a `docs/recovery/YYYY-MM-DD-8f2-restore-drill.md`
> handoff. That record is the artifact that flips 8f-1 from "backups exist" to "DR-confirmed".
> Note separately: DR precondition #1 (operator age key escrowed offsite) is NOT proven by this
> drill — Stage 0 only proves the key works today, not that it survives simultaneous laptop+server loss.

---

## Key rotation impact

When the operator age key is rotated (see `docs/runbooks/key-rotation.md`):
1. Update `.sops.yaml` with the new public key
2. `backup-db.sh` picks up the new recipient automatically on the next run (no script change)
3. Existing backup objects remain encrypted to the old key — they can still be decrypted until the old key is destroyed. Rotate objects if required by policy.
