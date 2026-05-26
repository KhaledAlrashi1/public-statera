# Recovery — 8e (TLS + reverse proxy + frontend delivery)

**Session date:** 2026-05-24
**8e closed:** 2026-05-24
**Production state:** live at https://staterafinance.app

This is the recovery doc for 8e (TLS + reverse proxy + frontend delivery via apex architecture). 8e was a single multi-hour session — no mid-session checkpoint doc was created.

The immediately preceding work is recorded in `docs/recovery/2026-05-23-8d-operational-pass-completion.md`. 8d closed the CI/CD pipeline; 8e built on that foundation to ship a live production environment.

---

## Commit timeline

| Commit  | Description |
|---------|-------------|
| 4d45603 | phase-3: 8e — web image Dockerfile and Caddyfile |
| 59d69fe | phase-3: 8e — drop redundant proxy headers and apply caddy fmt |
| 1caa098 | phase-3: 8e triage — fix 12 stale web unit tests (bundled fix; 12 logical fixes across 6 files in one commit) |
| e8e6d69 | phase-3: 8e — commit 2a — add frontend CI gating to test job |
| 52250a7 | phase-3: 8e — CI builds and pushes statera-web image |
| 27ae763 | phase-3: 8e — replace nginx service with Caddy-based web service |
| 829f8ef | phase-3: 8e — remove obsolete nginx and Flask-era config files |
| 4254c32 | phase-3: 8e — close-out and CLAUDE.md update |
| [THIS COMMIT SHA] | phase-3: 8e — recovery doc for TLS + frontend delivery |

---

## What changed

Production-facing changes from 8e:

- **`staterafinance.app` is now reachable on HTTPS via Let's Encrypt.** Before 8e: nothing external could reach the server (nginx in restart loop, no cert files). After 8e: site live, cert auto-renewing via Caddy.
- **Caddy replaces nginx** as reverse proxy and TLS terminator. The nginx service is removed entirely from `docker-compose.prod.yml`; `nginx/` directory removed from the repo.
- **Frontend SPA now deployed.** Before 8e: `apps/web/dist/` on the server was empty; the frontend had never been built for production. After 8e: built in CI by `deploy/web.Dockerfile`, baked into the `statera-web` Docker image, pulled and run alongside the API.
- **Production stack now 5 containers:** redis, mysql, api, worker, web. The migrate service runs only via `docker compose run --rm migrate`.
- **Health endpoints publicly reachable** at root (not under `/api/*`) via Caddy: `/healthz`, `/readyz`, `/health`.
- **Frontend CI gating active.** Before 8e: `apps/web` TypeScript and unit tests never ran in CI. After 8e: the `test` job in `.github/workflows/deploy.yml` includes `pnpm --filter statera-frontend exec tsc --noEmit` and `pnpm --filter statera-frontend run test:unit`.
- **CSP active in Report-Only mode** on all responses served by Caddy. Will be tightened to enforcing after ≥1 week of observation (see open items).
- **Frontend test suite triaged.** 12 pre-existing failures across 6 files were fixed during the session — including one real production bug in `applyTransactionSuggestion` that had shipped to the API image but was never observable because the frontend was never deployed until 8e. See CLAUDE.md fix-forward "8e — frontend test suite silent rot".

---

## Operational state at session close

**Production SHA:** [THIS COMMIT SHA] (leave placeholder — see footnote)

**Running stack (verified via `docker ps`):**
- `statera-web-1` — Caddy + dist, ports 80/443 published
- `statera-api-1` — Hono API, internal-only on 3000/tcp
- `statera-worker-1` — BullMQ worker, no exposed ports
- `statera-mysql-1` — MySQL 8, internal-only on 3306/tcp
- `statera-redis-1` — Redis 7, internal-only on 6379/tcp

**External verification (run from operator laptop):**
- DNS: `dig staterafinance.app +short` resolves to 89.167.76.236
- HTTPS: `curl -sI https://staterafinance.app/` returns HTTP/2 200 with HSTS header
- TLS cert: subject `CN=staterafinance.app`, issuer `Let's Encrypt CN=E8`
- HTTP redirect: `curl -sI http://staterafinance.app/` returns 308 to https://
- SPA fallback: arbitrary paths return SPA index.html
- API proxy: `curl -sf https://staterafinance.app/api/healthz` returns `{"ok":true,"status":"healthy","version":"..."}`

**ACME state:** persisted in `caddy_data` Docker volume (not bind-mounted). Survives container restarts and `docker compose down/up` cycles. Required to avoid Let's Encrypt rate limits on re-provisioning.

**SSH access state (carried from 8d, unchanged this session):**
- `/home/deploy/.ssh/authorized_keys`: 2 lines — operator v2 (line 1), CI deploy with `command=` restriction (line 2). Orphan prune from 8d remains in effect.
- Backup files: `~/.ssh/authorized_keys.bak.*` — 3 timestamped backups from prior operational sessions. Audit pending (see open items).

**Cloudflare DNS state:** A record for apex `staterafinance.app` resolves to 89.167.76.236, proxy disabled (gray cloud). Email Routing active for `ops@staterafinance.app` → operator's personal Gmail. Used by Let's Encrypt for cert-expiry notifications.

---

## Open items carried forward

**1. TODO(module-8e-csp-enforcement)** — Switch CSP from `Content-Security-Policy-Report-Only` to enforcing `Content-Security-Policy` after ≥1 week of production traffic shows no violations. Observation window opens 2026-05-24 (commit 27ae763 ship date). Decision criteria and notes in CLAUDE.md.

**2. TODO(module-8e-flask-era-artifact-audit)** — Disposition of `scripts/pg-backup.sh` and `.github/workflows/ci.yml`. Both reference Flask-era variables (POSTGRES_DB, CELERY_CONCURRENCY). The `ci.yml` workflow is currently failing on every push, contributing red CI noise that's silent (deploy.yml is the gating workflow). Worth investigating early to clear the noise. Disposition steps documented in CLAUDE.md.

**3. TODO(module-8d-node24-upgrade)** — Inherited from 8d, not closed by 8e. Action SHA bumps before 2026-06-02 (forced migration) or 2026-09-16 (Node 20 removal).

**4. Backup file audit** — `~/.ssh/authorized_keys.bak.*` on production server now contains backups from prior operational sessions. Each is a historical snapshot of `authorized_keys` content. Audit before final public release: inspect each, confirm no surprising entries, decide on retention policy or move them out of `.ssh/`. Carried over from 8d's orphan-prune fix-forward; no new backups created this session.

---

## Next module: 9 — Frontend parity verification

Per CLAUDE.md: "apps/web tested against the new Hono API end-to-end before any external sharing."

8e produced the production environment Module 9 needs. The frontend is now live; Module 9's job is to verify it behaves correctly against the new Hono backend (vs the previous Flask backend). This is integration testing, not unit testing — the unit-testing concern is handled by the CI gating added in commit e8e6d69.

**Starting points for Module 9:**

- Read CLAUDE.md's Module 9 entry and the "Public API contracts" section. Each contract bullet describes a client-observable behavior that must work end-to-end.
- Note Module 9 follow-ups documented in CLAUDE.md:
  - `income_source` enum updates in `apps/web/src/types/api.ts` and `sections.tsx` (lines specified in CLAUDE.md)
  - Analytics route prefix verification (`/api/analytics/*` in Hono vs `/api/*` root in Flask)
  - GDPR data-export endpoint before account deletion is exposed in UI
- The site is publicly reachable but unannounced. Module 9 work happens against the live site but no real user traffic exists yet. This is fine — Module 9's testing will be the first real load.

**Suggested opening prompt for the next session:**

> Resuming public-statera. Read CLAUDE.md first.
>
> 8e is fully closed as of 2026-05-24. Production is live at https://staterafinance.app — TLS via Let's Encrypt, Caddy serving SPA at / and reverse-proxying /api/* to the Hono backend. Full close-out arc in docs/recovery/2026-05-24-8e-tls-frontend-delivery.md.
>
> Module 9 is next: frontend parity verification — apps/web tested against the new Hono API end-to-end before any external sharing.
>
> Starting points are documented in the recovery doc's "Next module" section and in CLAUDE.md's Module 9 entry. Suggest beginning with a scoping read of the known frontend follow-ups in CLAUDE.md ("Module 9 must update apps/web/src/types/api.ts...") to identify the work scope.
>
> Standing rules apply.

---

*Note on [THIS COMMIT SHA] placeholder: this doc is itself committed as part of 8e's close-out. The production SHA is the commit-5 SHA (4254c32) at the time the doc is written — commit 6 (this commit) adds documentation only, doesn't change production runtime behavior. When commit 6 lands and CI runs the no-op re-deploy, the production SHA becomes commit 6's SHA. Both refer to the same operational state.*
