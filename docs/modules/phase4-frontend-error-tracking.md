# phase4-frontend-error-tracking — APPROVED LINEAGE

**Charter:** CLAUDE.md DISC-C1 → TODO(frontend-error-tracking), CHARTERED 2026-07-25 (own item, do-not-bundle, post-10d). `apps/web` had NO frontend error tracking; a user-facing crash reached no tracker. This module adds Option (c): a hand-rolled reporter → same-origin `POST /api/client-errors` → existing server-side Sentry.

**Persist-first record:** this file is written at the start of T1-0 (approved lineage before implementation). It holds the four ruling blocks verbatim, the Phase A proposal, and the §2 addendum (including the Item-F finding). An earlier unapproved draft was written then deleted (Phase A was not yet approved); this one is approved and belongs on disk.

---

## RULINGS OF RECORD (verbatim)

### SEQ-1 (2026-07-26)
This module is sequenced ahead of the money-string consumer sweep.

### SEQ-2 (2026-07-26)
10D-COND-1 INTEGRATION reconciliation assigned to this module; any non-zero INTEGRATION exit is a FINDING. DISCHARGED 2026-07-27 at 751 passed / 3 skipped / exit 0 on a clean start.

### SEQ-3 — Transport ruling (2026-07-27). OPERATOR RULING BY DELEGATION.
Option (c) APPROVED: hand-rolled reporter (componentDidCatch + global onerror/unhandledrejection) -> same-origin POST /api/client-errors -> existing server-side Sentry. Rationale of record: the only option requiring no CSP change and no browser-to-third-party origin, so it does not reverse the deliberate design-5.4e privacy narrowing. The endpoint is UNAUTHENTICATED by design; the pre-auth error class (/login, /privacy, /terms, /auth/2fa-verify, /delete-account/confirm, pre-hydration chunk failures) is in scope precisely because the pre-announcement legal pages are where a public crash matters most. Abuse control: per-IP keying on X-Real-IP (valid while the Cloudflare proxy remains disabled per the standing gray-cloud decision in CLAUDE.md), plus a global ceiling, body-size cap, same-origin filter, and schema validation.
FOUR CONDITIONS, ALL BLOCKING AT CLOSE-OUT:
- (i) every throttled, over-cap, or schema-rejected drop increments a server-side counter or emits a structured log line;
- (ii) a test proves a forwarded payload carrying a KWD amount and a merchant name is scrubbed before capture;
- (iii) the re-entrancy guard suppresses reports GENERATED DURING a send rather than acting as a global mutex, and counts what it drops;
- (iv) the payload carries `route` explicitly and forwarded events are tagged source:"frontend".

### F-1 — INTEGRATION residue disposition (2026-07-27). OPERATOR RULING BY DELEGATION.
The Item-F finding is accepted and does not belong to this module's code scope. TODO(integration-rate-limit-test-isolation) is REOPENED and widened. Two-step: (a) record the precondition in CLAUDE.md now, doc-only, authorized as a named rider on this module (see T1-4); (b) the real fix — a globalSetup scope-flush of rl:*, test-only — is its own cycle, NOT this one. Residue is not an attribution excuse; exit-1-by-attribution remains retired.

---

## PHASE A PROPOSAL (approved)

### 1. VERIFIED CURRENT STATE (re-verified against the tree)
- **No `@sentry/*` in `apps/web`.** `apps/web/package.json` carries no `@sentry/*`; the only `sentry` string in `apps/web/src` is a Privacy Policy disclosure (`PrivacyPolicyPage.tsx:144`), not code.
- **ErrorBoundary is reporting-blind.** `App.tsx:76–97` implements only `getDerivedStateFromError`; no `componentDidCatch`, no telemetry. The captured error renders `ErrorFallback` and is discarded.
- **No global handlers.** No `window.onerror` / `unhandledrejection` anywhere in `apps/web/src` (only a `FileReader.onerror` in ImportDialogs).
- **Boundary scope correction.** The single ErrorBoundary wraps the ENTIRE route table (`App.tsx:203–207`, `<ErrorBoundary><Suspense><AppRoutes/></Suspense></ErrorBoundary>`), public + protected. A boundary catches only render/lifecycle errors — event-handler and async/promise errors escape it, so the reporter MUST also install global `onerror`/`unhandledrejection` handlers.
- **lazyWithRetry (`App.tsx:23–55`).** One-shot hard reload then rethrow: first chunk failure → sessionStorage-guarded `window.location.reload()` + never-resolving promise (invisible); second failure → `throw` → reaches the ErrorBoundary (boundary-class, not `window.onerror`). Bounded to one reload per key; no storm.

### 2. TRANSPORT — Option (c) chosen (see SEQ-3)
Current CSP `deploy/Caddyfile:26` is same-origin-only (`connect-src 'self'`). (a) SDK-direct = CSP change + browser→third-party (reverses design-5.4e); (b) SDK-tunnel = no CSP change but backend envelope-parsing + client-side scrub; (c) hand-rolled → same-origin `/api/client-errors` → existing server Sentry = **no CSP change, no browser→third-party**, reuses the initialized server Sentry (`index.ts:3`, `worker/index.ts:2`) and its scrubber. Recommended (c); ruled (c) under SEQ-3.

### 3. PII & REDACTION
Allowlist payload (message, name, stack, route[normalized], kind, release, occurrences, ua) — no query string, no props, no amounts. Two-layer scrub: client mirror (email/IBAN/enc1:) + server-side (reused backend scrubber). Route sanitization: pathname only, `:id`-normalized. NOT "Sentry default scrubbing."

### 4. PRIVACY-DISCLOSURE DELTA
`PrivacyPolicyPage.tsx` §5 "Service providers" (`:116–118`) already lists **Sentry** (`:143–147`): "Sentry — receives error reports when something in the app breaks. Our error reporting is configured to scrub personal data before sending." Not scoped to backend → **no delta for Option (c)** (server forwards, no browser→third-party). Option (a) would need an amendment. No legal copy edited.

### 5. RELEASE IDENTITY & GATING
`GIT_SHA` reaches only the Caddy runtime stage of `deploy/web.Dockerfile`, not the Vite build stage. Fix (T1-3): add `ARG GIT_SHA` + `ENV VITE_GIT_SHA=${GIT_SHA}` to the build stage before `pnpm build`; CI already passes `--build-arg GIT_SHA` to the web build (`deploy.yml:143`) → no CI change. Reporter attaches `release`; gated to production builds only.

### 6. VOLUME CONTROL
Client dedupe (fingerprint + TTL) + per-session cap; chunk-miss suppression; server per-IP + global rate limit; Sentry grouping. 500-iteration loop → ~1 event.

### 7. SOURCE MAPS — TIERED
- **Tier 1 (ships first):** reporter + endpoint + release stamping, NO maps. Yields message + route + SHA + frequency + minified frame — enough to have diagnosed the 8f-4 case — but NOT function-named stacks. Stated plainly.
- **Tier 2 (fenced):** hidden source maps uploaded to Sentry (auth token, CI, Dockerfile). Not bundled.

### 8. TEST PLAN
Hermetic unit (schema/scrub/dedupe/route-norm/env-gate/boundary→report/chunk) + a production induced-error CAPTURED ARTIFACT (Sentry issue permalink with release-SHA tag). Operator attestation is the weakest evidence class; ≥1 captured artifact required.

### 9/10. BASELINES + INTEGRATION (measured 2026-07-27, verbatim captures)
api hermetic 736/18/51 exit 0; api tsc 0; web unit 166/35 exit 0; web tsc 0. INTEGRATION 751/3 exit 0 (690 [2026-07-19] + 61 fuzzy-ratio) — SEQ-2 discharged.

---

## §2 ADDENDUM (approved on substance)

- **Item 0:** original captures were typeset; re-run verbatim, all five green (api 736/18/51, web 166/35, INTEGRATION 751/3, both tsc 0). The Unhandled checks were `grep -n` (api, exit 1 = absent) and `grep -c` (web, count 0 = absent) — both ratify.
- **Item A (lazyWithRetry):** as §1 above — one-shot reload then rethrow; second failure is boundary-class; report it as `kind:"chunk-reload-failed"`, heavily deduped; first-attempt self-heal is invisible-by-construction (revisited in T1-2 as a `chunk-self-healed` low-severity signal).
- **Item B (auth posture):** `c.set("session")` runs ONLY in requireAuth (`auth.ts:129`), so an unauth route has no session → the `?? "anon"` fallback collapses all anon clients to one bucket → per-IP keying MANDATORY. Caddy sets `X-Real-IP {remote_host}` (`Caddyfile:33`); Cloudflare proxy disabled → true client IP. Authenticated-only would blind the pre-auth legal pages.
- **Item C:** re-entrancy guard suppresses reports generated DURING a send (+ swallow own rejection + self-origin filter); 16 KB body cap, head-truncated stack; attribution via `source:"frontend"` tag + `release`; payload carries `route` explicitly (server sees only the endpoint path).
- **Item D:** privacy sentence quoted verbatim (above §4); no delta for (c).
- **Item E:** `deploy.yml:134–144` — the statera-web build (`file: deploy/web.Dockerfile`) already receives `build-args: GIT_SHA=…` (`:143`). No CI change.

### ITEM F — FINDING (verbatim), drives F-1
Ran INTEGRATION twice back-to-back, no flush between. Redis started with 0 `rl:*` keys (TTL-expired).

Run 1 (no pre-flush, clean redis):
```
INTEGRATION_RUN1_EXIT=0
 Test Files  51 passed (51)
      Tests  751 passed | 3 skipped (754)
rl:* keys NOW present after run 1: 17
```
Run 2 (no flush, against Run 1's 17-key residue):
```
rl:* residue present BEFORE run 2: 17
INTEGRATION_RUN2_EXIT=1
 Test Files  2 failed | 49 passed (51)
      Tests  11 failed | 740 passed | 3 skipped (754)
```
Failure detail: `expected 429 to be 400` ×10 (`POST /api/budgets` on userId 1, shared `rl:rl:1:/api/budgets` bucket over heavyWrite limit) + `lib/rate-limit.test.ts` counting test. Mechanism: Run 1's live `rl:*` counters (60s TTL) pushed the shared bucket over limit, so the handler 429'd before its 400/200 logic.

**Conclusion (answer (i)):** the suite is NOT residue-idempotent. A reproducible INTEGRATION run REQUIRES the `rl:*` bucket clean at start (manual flush OR ≥60s TTL gap). This WIDENS TODO(integration-rate-limit-test-isolation) beyond its 2026-07-19 close (the 2026-07-19 fix covered 4 specific tests; `rate-limit.test.ts` + the userId-1 budgets POST suite remain residue-sensitive). Not fixed here (F-1 → own cycle for the globalSetup flush; doc rider now).

---

## IMPLEMENTATION LOG

- **T1-0 (docs):** this file.
- **T1-1 (backend, HARD GATE) — APPROVED (T1-1-APPROVE, 2026-07-27):** `apps/api/src/routes/client-errors.ts` (+ test), mounted in `app.ts` (NOT `index.ts`). Supporting: `lib/sentry.ts` (+`scrubText`), `middleware/auth.ts` (+`tryReadUserId`), `lib/rate-limit.ts` (+`createCustomRateLimiter`), contract-test rate-limit mock (+passthrough).
- **T1-1b (carried backend items):** (1) over-cap + cross-origin drop tests now assert BOTH the `[client-errors.drop]` log line AND the counter (condition i, all 4 drop reasons). (2) skipIf-contradiction resolved per T1-1-APPROVE: IPs are randomized-per-call (`t-${randomUUID()}`), so the mock-only 429 describe was REMOVED from the hermetic file and the real 429 is verified against real Redis in the new `routes/client-errors.integration.test.ts` (INTEGRATION-gated, unique-per-run IP → residue-immune).
- **T1-2 (frontend reporter):** `apps/web/src/lib/error-reporter.ts` (+ 13-test suite). Closed-allowlist payload (built field-by-field, never spreads the error); global `error`+`unhandledrejection` handlers + `initErrorReporter()` in `main.tsx` (earliest safe point — pre-entry import-graph errors are uncapturable, stated); `ErrorBoundary.componentDidCatch` (App.tsx, exported) forwards with chunk classification; re-entrancy guard suppresses only during-send (not a mutex); self-origin filter (global-handler kinds only, so self-heal isn't filtered); dedupe+occurrences; session cap; noise filters (Script error./ResizeObserver); route=pathname-only id-normalized; top-frame truncation; PROD-only gate; `VITE_GIT_SHA` release; self-heal `chunk-self-healed` with loop-safe deferred clear.
- **T1-3 (release stamping):** `deploy/web.Dockerfile` build stage `ARG GIT_SHA` + `ENV VITE_GIT_SHA=${GIT_SHA}` before `pnpm build`. No CI change (deploy.yml already passes the build-arg).
- **T1-4 (docs):** CLAUDE.md — POST /api/client-errors contract entry (+FIND-S1), api+web baselines updated (hermetic 750/19/53, INTEGRATION 766/3/53, web 179/36), F-1 rider reopening `TODO(integration-rate-limit-test-isolation)` with the named flush command, FIND-S2 recorded. Contract fixture: `POST /api/client-errors` ADDED via `capture.ts` NON_API_CALLS (silent-failure route must be contract-protected — implementer choice).
