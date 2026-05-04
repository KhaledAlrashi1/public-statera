# Runbook: Backup & Restore

**Service:** Statera / `personal-finance`
**Last reviewed:** 2026-03-05

---

## Overview

This runbook covers PostgreSQL backup and restore procedures for production.
The backup script (`scripts/pg-backup.sh`) produces a `pg_dump --format=custom`
archive and uploads it to S3-compatible object storage.

---

## 1. Prerequisites

| Tool | Minimum version |
|------|----------------|
| `pg_dump` / `pg_restore` | 15+ (match server major version) |
| `aws` CLI | 2.x |
| `docker compose` | v2 |

Required environment variables (set in `.env.prod`):

```
POSTGRES_HOST
POSTGRES_PORT
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
BACKUP_S3_BUCKET
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_DEFAULT_REGION
# Optional — for non-AWS S3-compatible endpoints:
BACKUP_S3_ENDPOINT=https://...
# Optional — S3 key prefix. Set this explicitly in `.env.prod`.
BACKUP_S3_PREFIX=personal-finance/backups
```

---

## 2. Taking a Manual Backup

```bash
# From project root, with .env.prod loaded
ENV_FILE=.env.prod bash scripts/pg-backup.sh
```

The script will:
1. Run `pg_dump --format=custom --no-owner --no-privileges`
2. Write to `backups/<db>_<timestamp>.dump`
3. Upload the dump to `s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/<filename>`
4. Print a ready-to-use `pg_restore` command

---

## 3. Scheduled Backups (Celery Beat / Cron)

For production, schedule daily backups via cron on the host or inside the
container. Example crontab entry (runs at 02:00 UTC):

```cron
0 2 * * * cd /opt/personal-finance && ENV_FILE=.env.prod bash scripts/pg-backup.sh >> /var/log/personal-finance/backup.log 2>&1
```

Recommended retention policy on the S3 bucket:
- **Daily backups:** keep 30 days
- **Weekly snapshots:** keep 90 days
- **Monthly archives:** keep 1 year

---

## 4. Verifying a Backup

```bash
# List the custom archive table of contents without restoring
pg_restore --list backups/<filename>.dump | head -40

# Quick row-count sanity check — restore to a scratch database
createdb -U postgres personal_finance_verify
pg_restore --clean --if-exists --no-owner --no-privileges \
  --host=localhost --port=5432 --username=finance \
  --dbname=personal_finance_verify backups/<filename>.dump
psql -U finance -d personal_finance_verify -c "SELECT COUNT(*) FROM transactions;"
dropdb -U postgres personal_finance_verify
```

---

## 5. Restore Procedure

> **Warning:** Restoring to a live database will overwrite data. Always take a
> fresh backup before restoring.

### 5a. Restore from local dump file

```bash
# 1. Stop application traffic (scale down backend/worker)
docker compose -f docker-compose.prod.yml stop backend worker beat

# 2. Restore to the target database (--clean drops existing objects first)
pg_restore --clean --if-exists --no-owner --no-privileges \
  --host=$POSTGRES_HOST \
  --port=$POSTGRES_PORT \
  --username=$POSTGRES_USER \
  --dbname=$POSTGRES_DB \
  backups/<filename>.dump

# 3. Confirm row counts look reasonable
psql -U $POSTGRES_USER -h $POSTGRES_HOST -d $POSTGRES_DB \
  -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;"

# 4. Restart services
docker compose -f docker-compose.prod.yml up -d backend worker beat
```

### 5b. Restore from S3

```bash
# Download the dump from S3 first
aws s3 cp s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/<filename>.dump backups/

# Then follow 5a above
```

### 5c. Point-in-time recovery

Statera does not currently use PostgreSQL WAL archiving. For PITR, enable
`wal_level=replica` and configure `archive_command` in `postgresql.conf`, then
use `pg_basebackup` for base backups and apply WAL segments. This is outside
the scope of this runbook for the initial v1.0 release.

---

## 6. Celery / Redis State

Redis is used for rate-limiting counters, Celery task queues, and result
backends. Redis state is **ephemeral and disposable** — do not back it up.

- On restore, restart the `redis` container to flush any stale state:
  ```bash
  docker compose -f docker-compose.prod.yml restart redis
  ```
- Celery will requeue any in-flight tasks at next startup via task acknowledgement.

---

## 7. Encryption Key Backup

The `ENCRYPTION_KEY` (AES-256) is separate from the database backup. Store it:

- In a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- **Never** committed to git or baked into Docker images
- In a separate secure offline location

Without the encryption key, encrypted fields (`totp_secret`, bank credentials)
cannot be decrypted even if you restore the database successfully.

See the [key-rotation runbook](key-rotation.md) for key management procedures.

---

## 8. Backup Health Checks

After each backup run, verify:

- [ ] S3 upload completed (exit code 0)
- [ ] Dump file size is non-zero and comparable to previous backups
- [ ] Monthly restore drill completed successfully in a staging environment
- [ ] Backup log contains no errors: `grep -i error /var/log/personal-finance/backup.log`
