# Statera

Statera is a personal finance app for Kuwait (KWD) built with Flask, PostgreSQL, React, Vite, Celery, and Redis.

The visible app brand is `Statera`. The repository and service slug are still `personal-finance`, and health probes report `personal-finance`.
This workspace uses frontend `3001`, host backend `5004`, Docker fallback backend `8004`, PostgreSQL `5435`, and Redis `6379` for local development.

## Current Product Surface

- Account registration, login, logout, password reset, and optional TOTP 2FA
- Multi-user transaction tracking with per-user data isolation
- Transaction create/edit/delete, split transactions, bulk delete, and bulk category update
- Shared and user-specific categories and merchants
- CSV/Excel import with preview, mapping, duplicate checks, and commit flow
- Monthly budgets, debt accounts, savings goals, and budget-alert notifications
- Demo workspace seeding via Flask CLI
- Analytics APIs for dashboard metrics, safe-to-spend, income pattern, recurring patterns, and weekly digest
- Feature flags via `GET /api/features`

Not currently shipped as normal user-facing features:

- `/insights`, `/spending`, `/spending-intelligence`, and `/dev-ui` are intentionally hidden in the current SPA
- Open Banking is hidden behind `ENABLE_OPEN_BANKING` and only partially implemented; provider token exchange and real-provider sync are not complete yet

## Tech Stack

- Backend: Flask, Flask-SQLAlchemy, Flask-Login, Flask-WTF, Flask-Bcrypt
- Frontend: React 19, TypeScript, Vite, TanStack Query
- Database: PostgreSQL only
- Background jobs: Celery worker + Celery beat + Redis
- Production static serving: Flask serves `frontend/dist` when it exists

## Requirements

- Python 3.10+
- Node.js 18+
- Docker Compose v2
- macOS only if you want to read the real Messages database directly; the snapshot workflow works for Docker/Linux-backed local setups

Docker images in this repo currently build with Python 3.12 and Node 20.

## Canonical Local Setup

Use this path if you are onboarding for the first time. It is the most reliable local setup flow in the current repo.

1. Clone the repo:

```bash
git clone <your-repo-url>
cd personal_statera
```

2. Bootstrap the repo environment:

```bash
make install
```

This creates `.venv`, installs the backend requirements into it, and installs
the frontend dependencies. If you want an activated shell afterwards:

```bash
source .venv/bin/activate
```

3. Create your local env file:

```bash
cp .env.example .env
```

4. Start PostgreSQL and Redis in Docker:

```bash
make infra-up
```

5. Apply migrations:

```bash
FLASK_APP=run.py ./scripts/flask db upgrade
```

If you are adopting a historical pre-Alembic database created with `create_all()`, stamp once instead:

```bash
FLASK_APP=run.py ./scripts/flask db stamp head
```

6. Start the backend on macOS in one terminal:

```bash
make backend
```

7. Start the frontend in a second terminal:

```bash
make frontend
```

8. Open the app:

```text
http://127.0.0.1:3001
```

## Actual Local Ports

- Frontend dev server: `3001`
- Backend host port with sample `.env`: `5004`
- Backend Docker fallback host port: `8004`
- PostgreSQL Docker host port: `5435`
- Redis Docker host port: `6379`

## Running Modes

### Recommended explicit two-terminal flow

Use the commands in [Canonical Local Setup](#canonical-local-setup).

For single-user macOS development, this is the normal workflow:

- PostgreSQL and Redis run in Docker
- Flask runs directly on macOS
- Vite runs directly on macOS

### Optional one-terminal launcher

The repo includes `make dev` with this workspace's frontend and backend defaults wired in. Use:

```bash
make dev
```

That single command now:

- starts PostgreSQL and Redis in Docker
- runs the backend directly on macOS
- runs the frontend directly on macOS

### Backend only

```bash
make backend
```

### Frontend only

```bash
make frontend
```

### Production-style local run

```bash
cd frontend && npm run build
cd ..
./scripts/python run.py
```

Then open `http://127.0.0.1:5004`.

## Current Visible Routes

The current SPA exposes these primary user-visible routes:

- `/`
- `/activity`
- `/plan`
- `/welcome`
- `/profile`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/security/email-change`
- `/security/password-change`

The following routes exist only as redirects and should not be documented as active UI pages:

- `/dev-ui`
- `/insights`
- `/spending`
- `/spending-intelligence`

## Environment Variables

Start with [`.env.example`](./.env.example). The most important variables for local work are:

- `DATABASE_URL`: required PostgreSQL connection string
- `TEST_DATABASE_URL`: dedicated PostgreSQL database for backend tests
- `FLASK_HOST`, `FLASK_PORT`: backend binding
- `APP_PORT`: Docker host port for the backend container
- `POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`: Docker-to-host ports for PostgreSQL and Redis
- `CORS_ORIGINS`: allowed browser origins for API requests
- `FRONTEND_BASE_URL`: used in password-reset and account-security email links
- `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`: Redis/Celery wiring
- `ENABLE_RECURRING_PATTERNS`: enables recurring-pattern analytics
- `ENABLE_TEMPLATE_SUGGESTIONS`: keeps template suggestions hidden unless explicitly enabled
- `ENABLE_OPEN_BANKING`: keeps the open-banking scaffold disabled by default
- `REQUIRE_2FA_FOR_BANK_CONNECT`: requires TOTP enrollment before bank-connect actions when open banking is enabled
- `SECURITY_EVENTS_RETENTION_DAYS`, `PRODUCT_EVENTS_RETENTION_DAYS`: maintenance retention windows
- `BANK_PREVIEW_RETENTION_DAYS`, `BANK_RAW_RETENTION_DAYS`, `BANK_REVOKED_NORMALIZED_RETENTION_DAYS`: open-banking data retention windows
- `BUDGET_ALERT_THRESHOLD_RATIO`: notification threshold for budget alerts
- `ENCRYPTION_KEY`: production field-encryption key
- `ENCRYPTION_KEY_PREVIOUS`: optional decrypt-only key during key rotation
- `EMAIL_DEV_LOG_PATH`: where dev-mode emails are written locally
- `MAIL_ASYNC_WORKERS`: async email thread-pool size
- `REDIS_OPERATION_TIMEOUT_SECONDS`: Redis client timeout used by shared rate limiting
- `SLOW_QUERY_THRESHOLD_MS`: logs SQL queries slower than this threshold
- `PROXY_FIX_NUM_PROXIES`: number of trusted reverse proxies in front of the app

Production-only secrets and deployment settings live in [`.env.prod.example`](./.env.prod.example).

## Database, Migrations, and Seed Data

- PostgreSQL is required. SQLite is no longer a supported runtime database.
- Schema changes are migration-driven through Alembic / Flask-Migrate.
- App startup does not auto-create tables.

Useful commands:

```bash
FLASK_APP=run.py ./scripts/flask db upgrade
FLASK_APP=run.py ./scripts/flask db stamp head
FLASK_APP=run.py ./scripts/flask init-db
FLASK_APP=run.py ./scripts/flask add-auth
FLASK_APP=run.py ./scripts/flask seed
FLASK_APP=run.py ./scripts/flask seed-memorized-transactions
FLASK_APP=run.py ./scripts/flask prune-memorized-transactions --dry-run
FLASK_APP=run.py ./scripts/flask memorized-transaction-stats
FLASK_APP=run.py ./scripts/flask run-maintenance-pass
```

Legacy SQLite migration commands are still registered as fail-fast stubs with PostgreSQL guidance. They are not operational workflows anymore.

## Testing and Quality Checks

Backend unit tests:

```bash
TEST_DATABASE_URL=postgresql://finance:change-me@localhost:5435/personal_statera_test \
./scripts/python -m unittest discover -s tests -p "test_*.py"
```

Migration integrity checks:

```bash
TEST_DATABASE_URL=postgresql://finance:change-me@localhost:5435/personal_statera_test \
./scripts/python -m unittest discover -s tests -p "test_migration_integrity.py"
```

Create the test database once if needed:

```bash
createdb -h localhost -p 5435 -U finance personal_statera_test
```

Important backend test notes:

- `./scripts/python`, `./scripts/pip`, and `./scripts/flask` all expect the repo-local `.venv`. If it is missing, run `make bootstrap-python` for backend-only work or `make install` for the full stack.
- The host-run backend tests expect PostgreSQL to be reachable via `TEST_DATABASE_URL`. With the sample local stack that means `localhost:5435`.

Frontend checks:

```bash
cd frontend
npm run lint
npm run test:unit
npm run build
```

Frontend e2e smoke:

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
```

Local CI bundles:

```bash
make ci-check
make ci-check-full
```

Load tests default to `http://127.0.0.1:5004` unless you override `BASE_URL`. If you are using the sample `.env` local backend, run k6 like this:

```bash
BASE_URL=http://127.0.0.1:5004 k6 run tests/load/dashboard.js
```

## Docker Workflows

### Optional full app stack in Docker

```bash
docker compose --profile docker-app up -d --build backend worker beat
```

Then check readiness:

```bash
curl -fsS http://127.0.0.1:8004/readyz
```

### Hybrid local dev: Docker services + host backend/frontend

This is the recommended local setup for day-to-day development:

```bash
make infra-up
make backend
make frontend
```

## API and Operational Notes

- [docs/openapi.yaml](./docs/openapi.yaml) is currently a partial static spec, not a complete source of truth for every route.
- Health probes:
  - `GET /healthz`
  - `GET /readyz`
  - `GET /api/worker-health`
  - `GET /api/admin/worker-health` with `Authorization: Bearer <token>`
- Feature flags:
  - `GET /api/features`

## Project Structure

```text
backend/                  Flask app package
  lib/                    Shared libraries (crypto, messages, log scrubber, maintenance helpers)
  routes/                 API blueprints
    analytics/            Analytics endpoints
  providers/              Open-banking provider adapter contract
  tasks.py                Celery scheduled tasks
  worker.py               Celery app
frontend/                 React + Vite app
  src/
    App.tsx               Router definitions
    components/
      layout/             App shell and shared layout
      pages/              Page components
      ui/                 Shared UI components
    lib/                  API clients and frontend helpers
migrations/               Alembic history
scripts/                  Utility scripts, deploy helpers, backups, benchmarking
tests/                    Backend tests and k6 load scripts
docs/                     OpenAPI, schema docs, runbooks, ADRs
run.py                    Backend entry point
Makefile                  Local developer commands
```

## Troubleshooting

- `DATABASE_URL environment variable is required`:
  - Copy `.env.example` to `.env`, then make sure PostgreSQL is running before you migrate or start the backend.
- Migrations fail to connect:
  - Start dependencies first with `make infra-up`.
- Frontend loads but API calls fail or hit the wrong port:
  - Start Vite with `make frontend`.
  - If you prefer `make dev`, the workspace defaults already point Vite at `http://127.0.0.1:5004`.
- Password-reset or account-security links point at the wrong origin:
  - Set `FRONTEND_BASE_URL=http://127.0.0.1:3001` in `.env` for local work.
- Built frontend changes do not appear in production-style local mode:
  - Re-run `cd frontend && npm run build` before restarting the backend.

## Supporting Docs

- [frontend/README.md](./frontend/README.md): frontend-specific workflow
- [DOCKER_RUNBOOK.md](./DOCKER_RUNBOOK.md): Docker-oriented local and operator workflows
- [RUNBOOK.md](./RUNBOOK.md): production operations
- [PRIVACY.md](./PRIVACY.md): retention and privacy notes
- [docs/runbooks/open-banking-provider-onboarding.md](./docs/runbooks/open-banking-provider-onboarding.md): current open-banking readiness and missing implementation pieces
