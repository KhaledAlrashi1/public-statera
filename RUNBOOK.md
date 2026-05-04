# Statera Production Runbook

## Scope
This runbook covers production deploy, rollback, backup/restore, and incident response for Statera.

The repository and Compose service slug remain `personal-finance`.

## Secrets Policy
Never commit production secrets. Set these in your hosting platform secret manager (Railway/Fly/etc.) or an untracked `.env.prod` file:

- `SECRET_KEY`
- `POSTGRES_PASSWORD`
- `SENTRY_DSN`
- `POSTMARK_API_KEY`
- `MAIL_FROM_ADDRESS`

Validate before deploy:

```bash
make check-secrets
```

## Deploy Procedure
Deploy script sequence: `git pull` -> build -> migrate -> start services -> reload nginx.

```bash
cp .env.prod.example .env.prod
# set real values in .env.prod (or load from platform secrets)
ENV_FILE=.env.prod ./scripts/deploy.sh
```

Post-deploy checks:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl -fsS https://<your-domain>/healthz
curl -fsS https://<your-domain>/readyz
```

## Rollback Procedure
1. Checkout previous known-good commit/tag.
2. Re-run deploy script from that revision.
3. Confirm `/healthz` and `/readyz` are green.
4. Monitor Sentry for new regressions.

```bash
git checkout <known-good-tag-or-sha>
ENV_FILE=.env.prod ./scripts/deploy.sh
```

## Backups
`scripts/pg-backup.sh` creates a PostgreSQL custom-format dump and uploads it to S3/R2.

Manual run:

```bash
ENV_FILE=.env.prod ./scripts/pg-backup.sh
```

Daily cron example (02:00 UTC):

```cron
0 2 * * * cd /opt/personal-finance && ENV_FILE=.env.prod ./scripts/pg-backup.sh >> /var/log/personal-finance-backup.log 2>&1
```

## Restore Drill
1. Provision a blank target database.
2. Download a backup `.dump` file from object storage.
3. Restore into target DB with `pg_restore`.

```bash
pg_restore --clean --if-exists --no-owner --no-privileges \
  --host=<host> --port=<port> --username=<user> \
  --dbname=<blank_db_name> /path/to/financedb_YYYYMMDDTHHMMSSZ.dump
```

After restore:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend flask db upgrade
curl -fsS https://<your-domain>/readyz
```

## Incident Response
1. Check uptime monitor status (`/healthz`).
2. Check Sentry for new exceptions and release correlation.
3. Check service health/logs:

```bash
make prod-logs
```

4. If needed, rollback to known-good commit and redeploy.
5. Record incident timeline, root cause, and mitigation actions.
