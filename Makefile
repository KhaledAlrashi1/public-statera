PYTHON := ./scripts/python
PIP := ./scripts/pip
FLASK := ./scripts/flask
PYTHON3 ?= python3
FLASK_PORT ?= 5004
FRONTEND_DEV_HOST ?= 127.0.0.1
FRONTEND_DEV_PORT ?= 3001
FRONTEND_PROXY_TARGET ?= http://127.0.0.1:$(FLASK_PORT)
PROD_ENV_FILE ?= .env.prod
PROD_COMPOSE := docker compose -f docker-compose.prod.yml --env-file $(PROD_ENV_FILE)
ACTIVATION_REPORT_DAYS ?= 30
ACTIVATION_REPORT_PATH ?= reports/activation-report.latest.json
MESSAGES_SNAPSHOT_INTERVAL_SECONDS ?= 60

.PHONY: dev backend frontend infra-up infra-down infra-logs bootstrap-python install build migrate test-backend lint-frontend lint-openapi test-frontend-unit test-frontend-e2e ci-check ci-check-full load-test load-test-auth load-test-import schema-diagram activation-report activation-report-json doctor-python messages-sync messages-sync-watch prod-up prod-down prod-migrate prod-logs check-secrets test-cascade-postgres audit-integrity verify-deletion

dev:          ## Start Flask + Vite in one terminal with clone-safe defaults
	@docker compose up -d postgres redis; \
	trap 'kill 0' EXIT; \
	FLASK_PORT=$(FLASK_PORT) PERSONAL_STATERA_DEV_MODE=true $(PYTHON) run.py & \
	cd frontend && FRONTEND_DEV_HOST=$(FRONTEND_DEV_HOST) FRONTEND_DEV_PORT=$(FRONTEND_DEV_PORT) VITE_API_PROXY_TARGET=$(FRONTEND_PROXY_TARGET) npm run dev -- --host $(FRONTEND_DEV_HOST) --port $(FRONTEND_DEV_PORT) & \
	wait

backend:      ## Start Flask only
	FLASK_PORT=$(FLASK_PORT) PERSONAL_STATERA_DEV_MODE=true $(PYTHON) run.py

frontend:     ## Start Vite only
	cd frontend && FRONTEND_DEV_HOST=$(FRONTEND_DEV_HOST) FRONTEND_DEV_PORT=$(FRONTEND_DEV_PORT) VITE_API_PROXY_TARGET=$(FRONTEND_PROXY_TARGET) npm run dev -- --host $(FRONTEND_DEV_HOST) --port $(FRONTEND_DEV_PORT)

infra-up:     ## Start PostgreSQL + Redis in Docker for the host backend
	docker compose up -d postgres redis

infra-down:   ## Stop PostgreSQL + Redis in Docker
	docker compose stop postgres redis

infra-logs:   ## Tail PostgreSQL + Redis logs
	docker compose logs -f postgres redis

bootstrap-python: ## Create/update the repo virtualenv and install backend deps
	@if [ ! -x .venv/bin/python ]; then \
		$(PYTHON3) -m venv .venv; \
	fi
	.venv/bin/pip install -r requirements.txt

install: bootstrap-python ## Install backend and frontend dependencies
	cd frontend && npm install

build:        ## Build React for production
	cd frontend && npm run build

migrate:      ## Apply Alembic migrations
	FLASK_APP=run.py $(FLASK) db upgrade

test-backend: ## Run backend unit tests
	$(PYTHON) -m unittest discover -s tests -p "test_*.py"

lint-frontend: ## Run frontend typecheck lint
	cd frontend && npm run lint

lint-openapi: ## Lint static OpenAPI spec
	npx @redocly/cli lint docs/openapi.yaml

test-frontend-unit: ## Run frontend unit tests
	cd frontend && npm run test:unit

test-frontend-e2e: ## Run frontend Playwright smoke tests
	cd frontend && npm run test:e2e

load-test: ## Run dashboard/analytics k6 load test
	k6 run tests/load/dashboard.js --vus 100 --duration 60s

load-test-auth: ## Run auth k6 load test (requires distributed IP buckets or relaxed auth rate limits)
	k6 run tests/load/auth.js --vus 50 --duration 60s

load-test-import: ## Run import k6 load test (requires distributed IP buckets or relaxed import rate limits)
	k6 run tests/load/import.js --vus 10 --duration 60s

schema-diagram: ## Generate docs/schema.png and docs/schema.md from SQLAlchemy metadata
	$(PYTHON) scripts/generate_schema_diagram.py

activation-report: ## Print the activation funnel summary
	FLASK_APP=run.py $(FLASK) activation-report --days $(ACTIVATION_REPORT_DAYS)

activation-report-json: ## Write activation funnel JSON to $(ACTIVATION_REPORT_PATH)
	FLASK_APP=run.py $(FLASK) activation-report --days $(ACTIVATION_REPORT_DAYS) --output $(ACTIVATION_REPORT_PATH)

ci-check:     ## Run local CI-equivalent checks
	$(MAKE) test-backend
	$(MAKE) lint-openapi
	$(MAKE) lint-frontend
	$(MAKE) test-frontend-unit
	$(MAKE) build

ci-check-full: ## Run full local CI including e2e
	$(MAKE) ci-check
	$(MAKE) test-frontend-e2e

doctor-python: ## Print project + shell python executables
	@echo "project-python: $$($(PYTHON) -c 'import sys; print(sys.executable)')"
	@echo "shell-python3: $$(command -v python3 || echo '<missing>')"

messages-sync: ## Refresh Messages snapshot only when the host DB is newer
	MESSAGES_SNAPSHOT_INTERVAL_SECONDS=$(MESSAGES_SNAPSHOT_INTERVAL_SECONDS) ./scripts/sync_messages_db.sh --if-stale

messages-sync-watch: ## Continuously refresh the Messages snapshot on the host
	MESSAGES_SNAPSHOT_INTERVAL_SECONDS=$(MESSAGES_SNAPSHOT_INTERVAL_SECONDS) ./scripts/sync_messages_db.sh --watch --interval $(MESSAGES_SNAPSHOT_INTERVAL_SECONDS)

check-secrets: ## Ensure required production secrets are present
	@set -eu; \
	if [ -f "$(PROD_ENV_FILE)" ]; then \
		set -a; . "$(PROD_ENV_FILE)"; set +a; \
	fi; \
	missing=0; \
	for key in SECRET_KEY ENCRYPTION_KEY OPERATOR_API_TOKEN POSTGRES_PASSWORD SENTRY_DSN POSTMARK_API_KEY MAIL_FROM_ADDRESS; do \
		value="$$(printenv "$$key" || true)"; \
		if [ -z "$$value" ]; then \
			echo "Missing required production secret: $$key"; \
			missing=1; \
		fi; \
	done; \
	if [ "$$missing" -ne 0 ]; then \
		exit 1; \
	fi; \
	echo "All required production secrets are set."

test-cascade-postgres: ## Run account deletion cascade tests against a real PostgreSQL DB (requires DATABASE_URL)
	@if [ -z "$$DATABASE_URL" ]; then \
		echo "ERROR: DATABASE_URL must be set to a PostgreSQL connection string."; \
		echo "  Example: DATABASE_URL=postgresql://finance:pass@localhost:5435/testdb make test-cascade-postgres"; \
		exit 1; \
	fi
	$(PYTHON) -m pytest tests/test_account_deletion_cascade.py tests/test_account_deletion_async.py tests/test_account_deletion.py -v

audit-integrity: ## Run SQL data integrity checks against the database (requires DATABASE_URL)
	@if [ -z "$$DATABASE_URL" ]; then \
		echo "ERROR: DATABASE_URL must be set."; \
		exit 1; \
	fi
	psql "$$DATABASE_URL" -f scripts/audit_data_integrity.sql

verify-deletion: ## Run standalone account deletion verification script against staging (requires DATABASE_URL)
	@if [ -z "$$DATABASE_URL" ]; then \
		echo "ERROR: DATABASE_URL must be set to a staging PostgreSQL connection string."; \
		exit 1; \
	fi
	$(PYTHON) scripts/verify_account_deletion.py --verbose

prod-up: check-secrets ## Start production compose stack
	$(PROD_COMPOSE) up -d --build

prod-down: ## Stop production compose stack
	$(PROD_COMPOSE) down

prod-migrate: check-secrets ## Run migrations in production compose stack
	$(PROD_COMPOSE) run --rm backend flask db upgrade

prod-logs: ## Tail production compose logs
	$(PROD_COMPOSE) logs -f --tail=200 backend worker beat nginx
