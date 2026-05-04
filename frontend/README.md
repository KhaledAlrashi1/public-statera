# Statera Frontend

React + Vite + TypeScript frontend for Statera.

The frontend dev server for this independent copy runs on `http://127.0.0.1:3001`. It does not read the root `.env` file for backend proxy settings, so you should still pass the backend target explicitly when developing against the host Flask app.

## Quick Start

From the repo root:

```bash
cp .env.example .env
docker compose up -d postgres redis
FLASK_APP=run.py ./scripts/flask db upgrade
PERSONAL_STATERA_DEV_MODE=true ./scripts/python run.py
```

In a second terminal:

```bash
cd frontend
VITE_API_PROXY_TARGET=http://127.0.0.1:5004 npm run dev -- --host 127.0.0.1 --port 3001
```

Open `http://127.0.0.1:3001`.

## Proxy Behavior

The Vite dev server proxies API requests to:

1. `VITE_API_PROXY_TARGET` if set
2. `FLASK_PORT` if set in the shell that launches Vite
3. `APP_PORT` if set in the shell that launches Vite
4. otherwise `http://127.0.0.1:5004`

For local host-backend development in this repo, use:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:5004 npm run dev -- --host 127.0.0.1 --port 3001
```

If you are pointing the frontend at the Docker backend instead, use:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:8004 npm run dev -- --host 127.0.0.1 --port 3001
```

## Current Visible App Routes

The current SPA exposes:

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

Routes that currently redirect away and should not be documented as active UI pages:

- `/dev-ui`
- `/insights`
- `/spending`
- `/spending-intelligence`

## Project Structure

```text
frontend/
├── public/                  Static assets
├── src/
│   ├── components/
│   │   ├── layout/          App shell, header, command palette
│   │   ├── pages/           Route-level page components
│   │   └── ui/              Shared UI primitives
│   ├── contexts/            Auth, preferences, quick-add, and other providers
│   ├── lib/                 API client, formatting, validation, and helpers
│   ├── types/               API-facing TypeScript types
│   ├── App.tsx              Router + providers
│   ├── main.tsx             Entry point
│   └── index.css            Design tokens and app styles
├── index.html
├── package.json
└── vite.config.ts
```

## Tech Stack

- React 19
- TypeScript
- Vite
- TanStack Query 5
- Tailwind CSS 4
- Radix UI primitives
- Recharts
- Lucide

## Building for Production

```bash
npm run build
```

Output goes to `frontend/dist/`. Flask serves that directory when it exists.

## Testing

Unit tests:

```bash
npm run test:unit
```

Lint + typecheck:

```bash
npm run lint
```

E2E smoke tests:

```bash
npx playwright install chromium
npm run test:e2e
```

## Frontend-Specific Notes

- The current visible nav is Home, Transactions, and Plan.
- Profile is reachable from the authenticated shell, not as a primary nav tab.
- Open Banking is hidden unless the backend feature flag enables it.
- Some analytics endpoints exist on the backend even when the older analytics routes are hidden in the SPA.
