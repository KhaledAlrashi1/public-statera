# Frontend Memory

This file is an internal project note for the frontend. It is not the primary onboarding guide.

## Current Runtime Truth

- Vite dev server runs on `http://127.0.0.1:3001`
- The frontend does not read the repo root `.env` for backend proxy settings
- For host-backend development, launch Vite with:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:5004 npm run dev -- --host 127.0.0.1 --port 3001
```

## Current Visible Navigation

- Home: `/`
- Transactions: `/activity`
- Plan: `/plan`
- Profile: `/profile`

Auth and security routes:

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/security/email-change`
- `/security/password-change`
- `/welcome`

Intentionally hidden or redirected routes:

- `/dev-ui`
- `/insights`
- `/spending`
- `/spending-intelligence`

## Source-of-Truth Files

- App shell and nav: `frontend/src/components/layout/AppShell.tsx`
- Router: `frontend/src/App.tsx`
- API proxy config: `frontend/vite.config.ts`
- Main onboarding guide: `README.md`
- Frontend-specific onboarding: `frontend/README.md`
