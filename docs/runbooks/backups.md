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

> TODO(8f-2): document step-by-step restore drill results here after the drill is completed.

The drill must:
1. Download a backup object from R2 (`rclone copy R2:statera-prod-db-backups/daily/<object> .`)
2. Decrypt: `age -d -i ~/.config/sops/age/keys.txt <object> | zstd -d > restore.sql`
3. Restore to a fresh MySQL container and verify table/row counts match production
4. Record the drill date, object used, and row counts verified

---

## Key rotation impact

When the operator age key is rotated (see `docs/runbooks/key-rotation.md`):
1. Update `.sops.yaml` with the new public key
2. `backup-db.sh` picks up the new recipient automatically on the next run (no script change)
3. Existing backup objects remain encrypted to the old key — they can still be decrypted until the old key is destroyed. Rotate objects if required by policy.
