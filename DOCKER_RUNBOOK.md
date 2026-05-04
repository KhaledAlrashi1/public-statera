# Docker Runbook

This runbook documents the current Docker workflows for this Statera workspace.

It intentionally does not describe the retired SQLite migration path or removed Make targets.

## 1. One-Time Setup

From the repo root:

```bash
cd /path/to/personal_statera
[ -f .env ] || cp .env.example .env
```

Verify the minimum required local values without printing secrets:

```bash
awk -F= '/^(DATABASE_URL|POSTGRES_PASSWORD|SECRET_KEY|APP_PORT|POSTGRES_HOST_PORT|REDIS_HOST_PORT)=/{v=$0; sub(/^[^=]*=/,"",v); printf "%s: %s\n",$1,(length(v)>0?"set":"MISSING")}' .env
```

## 2. Start Dependencies Only

For the normal local workflow, start PostgreSQL and Redis first:

```bash
docker compose up -d postgres redis
docker compose ps
```

These services back the host Flask app and the host Vite app described in the main [README.md](./README.md).
The Redis container is also published on `127.0.0.1:${REDIS_HOST_PORT:-6379}` so the host backend can use it directly.

## 3. Start the Optional Full Docker App Stack

Use this only when you intentionally want the fallback Docker app runtime. The
normal local workflow keeps Flask on macOS and only runs infrastructure in Docker.

To run the backend, worker, and beat in Docker:

```bash
docker compose --profile docker-app up -d --build backend worker beat
docker compose ps
```

Check readiness from the host:

```bash
APP_PORT="$(awk -F= '/^APP_PORT=/{print $2}' .env)"
curl -fsS "http://127.0.0.1:${APP_PORT}/readyz"
```

Check worker health from inside the stack if needed:

```bash
docker compose exec -T backend python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/api/worker-health').read().decode())"
```

## 4. Common Day-to-Day Commands

Show logs:

```bash
docker compose logs -f backend
docker compose logs -f worker
docker compose logs -f beat
docker compose logs -f postgres
docker compose logs -f redis
```

Rebuild and restart the fallback Docker app services after code changes:

```bash
docker compose --profile docker-app up -d --build backend worker beat
```

Restart backend only:

```bash
docker compose restart backend
```

Stop the stack:

```bash
docker compose down
```

Remove containers and the Postgres volume only if you explicitly want to wipe local data:

```bash
docker compose down -v
```

## 5. Migrations in Docker

If the backend stack is already available, you can run migrations in the container:

```bash
docker compose exec -T backend flask db upgrade
```

For first-time local onboarding, the repo README still prefers the host command:

```bash
FLASK_APP=run.py ./scripts/flask db upgrade
```

## 6. PostgreSQL Admin Tasks

Open a Postgres shell:

```bash
docker compose exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Create the backend test database if it does not exist:

```bash
docker compose exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='\''personal_statera_test'\''" | grep -q 1 || createdb -U "$POSTGRES_USER" personal_statera_test'
```

Take a local SQL dump from the running Postgres container:

```bash
ts="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "personal_statera_backup_${ts}.sql"
ls -lh "personal_statera_backup_${ts}.sql"
```

Restore a SQL dump into the running Postgres container:

```bash
cat personal_statera_backup_<timestamp>.sql | docker compose exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

For production-style object-storage backups, use [docs/runbooks/backup-restore.md](./docs/runbooks/backup-restore.md) and `scripts/pg-backup.sh`.

## 7. Safety Notes

- PostgreSQL is the only supported runtime database in this repo.
- The old SQLite migration flow is intentionally removed. Do not rely on `flask migrate-sqlite-to-postgres`.
- Removed Make targets such as `make postgres-up`, `make backend-imessages`, `make backup-db`, and `make install-backup-job` are not part of the current repo.
- Always verify `/readyz` after migrations or restore operations.
