-include .env
export

API_PORT ?= 3000
FRONTEND_DEV_HOST ?= 127.0.0.1
FRONTEND_DEV_PORT ?= 3002
FRONTEND_PROXY_TARGET ?= http://127.0.0.1:$(API_PORT)
PROD_ENV_FILE ?= .env.prod
PROD_COMPOSE := docker compose -f docker-compose.prod.yml --env-file $(PROD_ENV_FILE)

.PHONY: dev stop api frontend install build migrate test-api lint-frontend lint-openapi test-frontend-unit test-frontend-e2e ci-check ci-check-full load-test load-test-auth load-test-import infra-up infra-down infra-logs check-secrets prod-up prod-down prod-migrate prod-logs

dev:          ## Start everything (infra + API + frontend); Ctrl-C stops everything
	@docker compose up -d mysql redis; \
	trap 'kill 0; docker compose stop mysql redis' EXIT; \
	cd apps/api && API_PORT=$(API_PORT) pnpm dev & \
	cd apps/web && FRONTEND_DEV_HOST=$(FRONTEND_DEV_HOST) FRONTEND_DEV_PORT=$(FRONTEND_DEV_PORT) VITE_API_PROXY_TARGET=$(FRONTEND_PROXY_TARGET) pnpm dev -- --host $(FRONTEND_DEV_HOST) --port $(FRONTEND_DEV_PORT) & \
	wait

stop:         ## Stop infra containers (use when infra is left running without make dev)
	docker compose stop mysql redis

api:          ## Start Node API only
	cd apps/api && API_PORT=$(API_PORT) pnpm dev

frontend:     ## Start Vite only
	cd apps/web && FRONTEND_DEV_HOST=$(FRONTEND_DEV_HOST) FRONTEND_DEV_PORT=$(FRONTEND_DEV_PORT) VITE_API_PROXY_TARGET=$(FRONTEND_PROXY_TARGET) pnpm dev -- --host $(FRONTEND_DEV_HOST) --port $(FRONTEND_DEV_PORT)

infra-up:     ## Start MySQL + Redis in Docker
	docker compose up -d mysql redis

infra-down:   ## Stop MySQL + Redis
	docker compose stop mysql redis

infra-logs:   ## Tail MySQL + Redis logs
	docker compose logs -f mysql redis

install:      ## Install all workspace dependencies
	pnpm install

build:        ## Build frontend for production
	pnpm --filter statera-frontend build

migrate:      ## Run pending Drizzle migrations
	cd apps/api && pnpm db:migrate

test-api:     ## Run API unit tests
	cd apps/api && pnpm test

lint-frontend: ## Run frontend typecheck + eslint
	pnpm --filter statera-frontend lint

lint-api:     ## Run API typecheck + eslint
	pnpm --filter statera-api lint

lint-openapi: ## Lint static OpenAPI spec
	npx @redocly/cli lint docs/openapi.yaml

test-frontend-unit: ## Run frontend unit tests
	pnpm --filter statera-frontend test:unit

test-frontend-e2e: ## Run frontend Playwright smoke tests
	pnpm --filter statera-frontend test:e2e

load-test: ## Run dashboard/analytics k6 load test
	k6 run tests/load/dashboard.js --vus 100 --duration 60s

load-test-auth: ## Run auth k6 load test
	k6 run tests/load/auth.js --vus 50 --duration 60s

load-test-import: ## Run import k6 load test
	k6 run tests/load/import.js --vus 10 --duration 60s

ci-check:     ## Run local CI-equivalent checks
	$(MAKE) lint-api
	$(MAKE) lint-openapi
	$(MAKE) lint-frontend
	$(MAKE) test-api
	$(MAKE) test-frontend-unit
	$(MAKE) build

ci-check-full: ## Run full local CI including e2e
	$(MAKE) ci-check
	$(MAKE) test-frontend-e2e

check-secrets: ## Ensure required production secrets are present
	@set -eu; \
	if [ -f "$(PROD_ENV_FILE)" ]; then \
		set -a; . "$(PROD_ENV_FILE)"; set +a; \
	fi; \
	missing=0; \
	for key in ENCRYPTION_KEY MYSQL_PASSWORD SESSION_SECRET MANUS_CLIENT_ID MANUS_CLIENT_SECRET SENTRY_DSN POSTMARK_API_KEY MAIL_FROM_ADDRESS; do \
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

prod-up: check-secrets ## Start production compose stack
	$(PROD_COMPOSE) up -d --build

prod-down: ## Stop production compose stack
	$(PROD_COMPOSE) down

prod-migrate: check-secrets ## Run migrations in production compose stack
	$(PROD_COMPOSE) run --rm api pnpm db:migrate

prod-logs: ## Tail production compose logs
	$(PROD_COMPOSE) logs -f --tail=200 api worker nginx
