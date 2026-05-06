# Statera

Statera is a personal finance app for Kuwait (KWD).

> **Status: Phase 2 scaffold complete.** The Node.js/Hono API is running with a
> full MySQL 8 schema, provider-agnostic OIDC auth (Google by default), and
> health routes. Business logic (transactions, budgets, analytics) is being
> ported in Phase 3.

## Tech Stack

| Layer | Technology |
|---|---|
| API | Node.js 22 LTS, TypeScript, [Hono](https://hono.dev) |
| ORM / migrations | [Drizzle ORM](https://orm.drizzle.team), drizzle-kit |
| Database | MySQL 8.0 (`utf8mb4`, `utf8mb4_0900_ai_ci`) |
| Auth | OIDC Authorization Code flow — Google by default, any OIDC issuer by config |
| Session | HS256 JWT cookie (`statera_session`, 30-day expiry) |
| Background jobs | BullMQ + Redis |
| Emails | Postmark Node SDK |
| Observability | Sentry Node SDK |
| Field encryption | AES-256-GCM, `enc1:<base64url>` wire format |
| Frontend | React 19, TypeScript, Vite, TanStack Query |
| Package manager | pnpm workspaces (`apps/api`, `apps/web`) |
| Test runner | Vitest (API), Playwright (frontend E2E) |

## Local Setup

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker Compose v2

### First run

```bash
git clone <your-repo-url>
cd public-statera

# Install all workspace dependencies
pnpm install

# Copy env and fill in any secrets you need
cp .env.example .env

# Start MySQL and Redis
docker compose up -d mysql redis

# Apply the Drizzle migration (once MySQL is healthy)
cd apps/api && pnpm db:migrate && cd ../..

# Start the API (terminal 1)
cd apps/api && pnpm dev

# Start the frontend dev server (terminal 2)
cd apps/web && pnpm dev
```

Or use the Makefile:

```bash
make infra-up   # MySQL + Redis only
make api        # API dev server
make frontend   # Frontend dev server
make dev        # All four in one terminal
```

### Local ports (defaults)

| Service | Port |
|---|---|
| API | `3000` |
| Frontend dev server | `3002` |
| MySQL | `3306` |
| Redis | `6379` |

## OAuth Setup (Google)

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable the **Google Identity** API
3. Create OAuth 2.0 credentials → Web application
4. Add `http://127.0.0.1:3000/api/auth/callback` to **Authorized redirect URIs**
5. Set in `.env`:
   ```
   OAUTH_CLIENT_ID=<your-client-id>
   OAUTH_CLIENT_SECRET=<your-client-secret>
   ```

To swap providers, set `OAUTH_ISSUER_URL` to any OIDC-compliant issuer and update `OAUTH_PROVIDER` (used as the `auth_provider` label stored on the user row).

## API Routes (Phase 2)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/healthz` | Health check (alias) |
| `GET` | `/readyz` | Readiness check |
| `GET` | `/api/auth/login` | Redirect to OIDC provider |
| `GET` | `/api/auth/callback` | OIDC callback — upserts user, sets session cookie |
| `POST` | `/api/auth/logout` | Clear session cookie |
| `GET` | `/api/auth/me` | Return current session (requires auth) |

Business-logic routes (transactions, budgets, categories, merchants, analytics) are wired in Phase 3.

## Production Deploy

```bash
# Build frontend
cd apps/web && pnpm build && cd ../..

# Bring up the full stack
docker compose -f docker-compose.prod.yml up -d

# Run migrations
docker compose -f docker-compose.prod.yml exec api pnpm db:migrate
```

Required production env vars (see `.env.example` for full list):
`DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `CORS_ORIGINS`

## Makefile targets

```
make dev            Start infra + api + frontend in one terminal
make infra-up       MySQL + Redis only
make infra-down     Stop infra containers
make api            API dev server (tsx watch)
make frontend       Frontend dev server (vite)
make migrate        Run Drizzle migrations
make test-api       Vitest
make lint-api       tsc --noEmit + eslint
make build          Build frontend + typecheck API
make prod-up        docker compose -f docker-compose.prod.yml up
make prod-migrate   Run migrations in production container
```
