# 8f-4 Deploy-rollback rehearsal — disposition + drill spec

Persist-first record (standing rule: approval lineage must survive compaction).
Status: **DRILLED 2026-07-25 (scope-bounded; items (i)/(iii)/(iv) PROVEN, item (ii)
QUALIFIED — "clean-console rollback proof: NOT ACHIEVED").** Executed on the natural pair
8260cd6 ↔ 247824a; no re-drill. See "Drill execution record + CLOSE-OUT (2026-07-25)" below.
Item (ii) NARROWED per 8F4-R6. Carried follow-ons (do NOT bundle): 8F4-R4 `_rollback()` web
scope; 8F4-R6 CSP-delta rollback proof; money-string consumer sweep; DISC-C1 finding.

**8F4-R6 RESULT (checked 2026-07-19, before the drill):** `git diff --stat 247824a..HEAD
-- deploy/Caddyfile` is **EMPTY (byte-identical)** — no Caddyfile commit in 247824a..HEAD
(the last was `acfd452` design-5.4e, already live). Therefore evidence item (ii) proves ONLY
that the web image reverts and the rolled-back site serves with a clean console; it does
**NOT** prove CSP-delta reversion. **CSP reversion is UNPROVEN** and recorded as such;
queued follow-on **"CSP-delta rollback proof"** rides the next deploy that actually changes
`deploy/Caddyfile` (e.g. design-5.6 if it touches CSP). The 8f-4 close-out MUST state this
narrowing and MUST NOT claim CSP reversion was drilled.

Investigation that produced this ruling: see the 8f-4 Phase A investigation
(this session, 2026-07-19). Evidence of record for the superseded 2026-05-23 test:
`docs/recovery/2026-05-23-8d-operational-pass-completion.md:95-117,167`; CLAUDE.md 8d
entry. The rollback mechanism: `deploy/deploy.sh` `_rollback()` (api+worker only) +
§5 migrate-before-§6-up ordering.

---

## Ruling (verbatim, 2026-07-19)

> 2026-07-19 — Ruling: 8f-4 disposition — OPTION A (scoped re-drill)
> approved; premise corrected; two structural findings recorded
>
> 8F4-R0 (premise correction): the channel's framing — that 8f-4 was
> dispositioned "already satisfied" — is FALSE and is withdrawn. git grep
> shows one hit: CLAUDE.md:76 "8f-4 Deploy-rollback rehearsal: NOT
> STARTED". No doc, commit, or handoff dispositions it satisfied. The
> written record was accurate; the verbal claim was not. The category
> slip is recorded: the 2026-05-23 test closed 8d (CI pipeline mechanics),
> never 8f-4 (rehearsal of the current rollback path).
>
> 8F4-R1 (verdict adopted): (c) — the informal claim is a
> pass-for-the-wrong-reason. Genuinely proven 2026-05-23: re-pull of a
> prior SHA-tagged api image + healthy liveness, and GHCR SHA-tag
> retention. Never exercised: web/Caddy image revert, Caddyfile/CSP
> reversion, compose-topology reversion under --remove-orphans, current
> deploy.sh, browser/console verification, and rollback across a
> destructive migration (architecturally impossible).
>
> 8F4-R2 (disposition): OPTION A — scoped re-drill, as recommended.
> DRILL PAIR — no synthetic commits: the pending docs/phase-4-open riders
> include the C2 fix-forward, which touches apps/web ⇒ the NEXT deploy
> produces a SHA differing from live 247824a in BOTH api and web images.
> Drill that natural pair: deploy next SHA → workflow_dispatch rollback to
> 247824a → forward again. Acceptance evidence, all four required:
>   (i)  both api AND web images revert (docker inspect image tags/OCI
>        revision labels at each stage, not probe SHA alone);
>   (ii) the ROLLED-BACK Caddyfile/CSP actually SERVES — operator browser
>        walk with console open at the rolled-back SHA (fonts render,
>        zero "Refused to load"), per the CSP-vacuity lesson: probe SHA
>        is an artifact check, not a behavior check;
>   (iii) --remove-orphans reaps nothing wanted — container list captured
>        before and after the rollback deploy;
>   (iv) both probes SHA-matched at each stage, verbatim.
> The drill does NOT and cannot test the migration hole (R2-restore
> territory, already drilled 8f-2) — stated as scope, not as a gap.
>
> 8F4-R3 (recorded regardless of any test — CLAUDE.md, next docs touch):
>   (a) MIGRATION FLOOR: rollback cannot cross migrations 0004-0006;
>       effective floor is 88a157f onward; below it recovery is R2
>       restore. deploy.sh's "migrations are NOT reverted" comment is the
>       mechanism; drizzle-kit rolls forward only.
>   (b) _ROLLBACK() SCOPE ASYMMETRY: the automatic in-deploy _rollback()
>       runs `up -d api worker` and never reverts `web`; the Caddyfile and
>       CSP ride the web image, so an auto-rollback serves the NEW CSP
>       against the OLD api. Recorded now as a known limitation.
>
> 8F4-R4 (separate disposition, DO NOT BUNDLE): whether to widen
> _rollback() to include web is a deploy.sh PRODUCTION change requiring
> its own proposal and its own cycle. It is NOT part of the drill and NOT
> part of 10d close. Queue it as a named follow-on ("_rollback() web
> scope") for disposition after 10d — fix-or-affirm, operator call.
>
> SEQUENCE: record 8F4-R3 (a)+(b) in the next docs touch → next deploy →
> drill per 8F4-R2 → 8f-4 close-out with the four evidence items → then
> 10d close. Do not begin until the deploy prompt issues.

---

## Ruling addendum (verbatim, 2026-07-19)

> 2026-07-19 — Ruling: 8f-4 drill GO (operator delegated); item (ii)
> narrowed; docs commit authorized
>
> 8F4-R5 (GO): the scoped re-drill is APPROVED to run. Operator delegated
> the go/no-go to the channel (2026-07-19, "do what you think is best");
> channel rules GO. Attribution: operator ruling by delegation, citable
> as 8F4-R5, 2026-07-19.
>
> 8F4-R6 (item (ii) NARROWED — before the drill, not after): verify
> whether deploy/Caddyfile is byte-identical between 247824a and the
> deploy SHA (paste `git diff --stat 247824a..HEAD -- deploy/Caddyfile`).
> If identical (expected — no CSP work since acfd452), then evidence item
> (ii) proves ONLY: the web image reverts and the rolled-back site serves
> correctly with a clean console. It does NOT prove CSP-delta reversion.
> The close-out must state this narrowing explicitly and MUST NOT claim
> CSP reversion was drilled. QUEUED FOLLOW-ON: "CSP-delta rollback proof"
> — rides the next deploy that actually changes deploy/Caddyfile (e.g.
> design-5.6 if it touches CSP); until then, CSP reversion is UNPROVEN and
> recorded as such. If the diff is non-empty, item (ii) stands as
> originally written and the follow-on is unnecessary.
>
> 8F4-R7 (docs commit): commit the two 8f-4 docs edits NOW as standalone
> `phase-4: 8f-4 disposition + drill spec (8F4-R0..R6)` on
> docs/phase-4-open — persist-first for a drill that has not yet run; it
> must not depend on the deploy it triggers.

**Applied:** the diff was EMPTY (see 8F4-R6 RESULT at top) → item (ii) is narrowed;
"CSP-delta rollback proof" is queued as a named follow-on.

---

## Drill run-sheet (execute only when the deploy prompt issues)

Baseline live SHA (rollback target) = **247824a** (10d Docker log cap + `--remove-orphans`).
Drill pair = **next-deploy SHA** (differs from 247824a in BOTH api and web images, because
the C2 fix-forward rider touches `apps/web`) ↔ **247824a**.

1. **Forward deploy** the next SHA (normal push to `main` / CI). Record: workflow run id,
   `/healthz` + `/readyz` SHA at both edges (verbatim), and `docker inspect` image
   tag/OCI-revision for `statera-api` AND `statera-web` on-box.
2. **Rollback** via `workflow_dispatch sha=247824a`. Capture, per 8F4-R2:
   - (i) `docker inspect` image tag + OCI revision for **both** api and web = 247824a (not probe alone);
   - (iii) `docker compose ps` container list BEFORE and AFTER — confirm `--remove-orphans` reaps nothing wanted;
   - (iv) `/healthz` + `/readyz` both report 247824a, verbatim.
3. **Operator browser walk at the rolled-back SHA** (ii, NARROWED per 8F4-R6): staterafinance.app
   with console open, hard-reload login + dashboard + one CSP-sensitive page (2FA-QR / import /
   insights) — fonts render, zero `Refused to load`. Probe SHA is an artifact check; this is the
   behavior check. **Because the Caddyfile is byte-identical across the drill pair, this proves
   web-image revert + clean serve ONLY — NOT CSP-delta reversion (see the "CSP-delta rollback
   proof" follow-on).**
4. **Forward again** to the next SHA (restore head). Confirm probes SHA-match.
5. **Close-out** with the four evidence items (i)-(iv) verbatim → then 10d close.

**Out of scope (stated, not a gap):** the migration hole (8F4-R3a) — a rollback below
88a157f is R2-restore territory, already drilled under 8f-2. The drill pair (both post-SC-3)
never crosses 0004-0006, so migrate is a no-op at 247824a.

---

## Drill execution record + CLOSE-OUT (2026-07-25) — DRILLED, item (ii) QUALIFIED

Executed the scoped re-drill (8F4-R2/R5) on the natural pair **8260cd6 (deploy) ↔ 247824a
(rollback target)**. Migration-free precondition proven first (`git diff --name-only
247824a..HEAD -- apps/api/src/db/migrations/` EMPTY, exit 0). Three stages:

| Stage | SHA | Probes (iv) | api/web image identity (i) | Containers (iii) |
|---|---|---|---|---|
| 1 DEPLOYED (before) | 8260cd6 | `/healthz`+`/readyz` = 8260cd6 ✓ | api+web+worker `...:8260cd6`, revision `8260cd6` (operator on-box) | api/web/worker fresh; **mysql+redis untouched (6d)**; no orphans |
| 2 ROLLED BACK | 247824a | `/healthz`+`/readyz` = 247824a ✓ | api+web+worker `...:247824a`, revision `247824a` (operator on-box) | api/web/worker recreated at 247824a; **mysql+redis untouched**; nothing wanted reaped |
| 3 RESTORED | 8260cd6 | `/healthz`+`/readyz` = 8260cd6 ✓ | api+web+worker back at 8260cd6 (tag AND OCI revision) | api/web/worker restored; **mysql+redis untouched across ALL THREE stages — no datastore bounce anywhere** |

Deploy runs: forward `30162619279` (success), rollback `30163044584` (success, `workflow_dispatch sha=247824a`), restore `30163693689` (success, `sha=8260cd6`).

**Evidence items (i), (iii), (iv): PROVEN across all three stages.** The web image reverts
and restores by tag AND OCI revision (not probe-SHA proxy); `--remove-orphans` reaped
nothing wanted; datastores never bounced (config identical across the pair).

**Evidence item (ii): QUALIFIED — "clean-console rollback proof: NOT ACHIEVED."** The
rolled-back build DID serve (SPA loaded, routed, the error boundary itself rendered ⇒
web-image revert works), but the console was **NOT clean**: at 247824a the operator's
screenshot showed the app error boundary on the **DASHBOARD** with an uncaught
`TypeError: d.toFixed is not a function (In 'd.toFixed(3)', 'd.toFixed' is undefined)` in a
Recharts render path (`formatter` in `DashboardPage-<hash>.js` → `ResponsiveContainer`).

### S2-RETRACT + evidence-class lesson (recorded)
My initial DRILL-S2 block recorded item (ii) as "console walk: clean, zero Refused to load,
fonts render." **That verdict was WITHDRAWN** — the operator's screenshot at 247824a
falsified it. **Evidence-class lesson:** operator attestation is the weakest evidence class in
this channel; a "clean console" claim must carry at least one captured artifact per walk. The
screenshot corrected the record.

### Discriminator — INCONCLUSIVE (confounded), not a rollback finding
Operator re-walk at 8260cd6: the dashboard `TypeError` was **ABSENT**. The reading "GONE ⇒
rollback re-exposed a defect the forward SHA fixes" is **REJECTED as mechanically
unsupported:** (a) C2's flip-only tsc capture (`3ac360a`) showed EXACTLY two `TS2365` errors,
at `sections.tsx:1390` and `:1435` — had any `.toFixed()` consumed a `SnapshotResponse`
field, the number→string flip would have errored there too; it did not ⇒ the crashing
`d.toFixed(3)` consumes **no** snapshot field; (b) types are erased at runtime, and the only
runtime deltas in the sole apps/web rider are those two `Number()` sign coercions in
`FinancialSnapshotHero`, not a chart formatter ⇒ **no code delta in `247824a..8260cd6` can
explain the disappearance.** **CONFOUND:** the two walks were ~2h apart, spanning analytics
Redis cache TTLs and the `dashboard_snapshots` rebuild job (Redis never recreated during the
drill); the crash sits inside a Recharts data map ⇒ **data-dependent ⇒ intermittent**, and a
data change between observations explains GONE with no code delta. **Epistemic note:** the
channel predicted PERSISTS; this rejection rests on the flip-only tsc artifact (captured
earlier, for another purpose), not on defending the prediction.

### DISC-C1 (machine evidence, read-only) — NO frontend error tracking (FINDING)
`apps/web/package.json` has **no `@sentry/*` dependency**; `apps/web/src` has no
`captureException`/`captureMessage` (the only "Sentry" string is Privacy-policy body text).
The `ErrorBoundary` (`apps/web/src/App.tsx:76-97`) implements **only**
`static getDerivedStateFromError` (returns render state) — **no `componentDidCatch`, no
reporting side-effect**; no global `window.onerror`/`unhandledrejection` handler exists.
**⇒ Frontend errors reach NO tracker.** Backend Sentry (module 1a) never sees a user-facing
frontend crash; the only detector is an operator happening to look — exactly how today's crash
surfaced (a drill screenshot, not an alert). A Sentry query cannot settle this TypeError's
attribution/intermittency because no events are recorded. Reported; fix nothing (own finding).

### Close-out disposition
8f-4 closes **DRILLED (scope-bounded, item (ii) qualified)** — no re-drill (proportionate).
Carried findings: **8F4-R6 narrowing** (Caddyfile byte-identical across the pair ⇒ item (ii)
proves web-image revert + serve only; **CSP-delta reversion UNPROVEN**, follow-on "CSP-delta
rollback proof" queued); **8F4-R3(a)** migration floor; **8F4-R3(b)** `_rollback()` web-scope
asymmetry; **DRILL-S1-N1** operator-seam hazard; the retracted attestation + evidence-class
lesson; **DISC-C1** no-frontend-error-tracking finding.

## Operator-seam hazard (DRILL-S1-N1, recorded 2026-07-25 — no action this cycle)

Manual `docker compose -f docker-compose.prod.yml ps|inspect` from the deploy shell emits
~30 `variable is not set … defaulting to blank string` WARNs because the sops-decrypted env
is absent outside `deploy.sh`. **Harmless for read-only subcommands** (`ps`, `inspect`,
`logs`), but a manual `up`/`restart`/`recreate` from that shell WOULD recreate containers
with **blank secrets**. Rule: read-only compose subcommands are safe by hand; **lifecycle
subcommands (`up`/`restart`/`recreate`/`down`) are `deploy.sh`-only** (it sources the sops
env). Recorded as an operator-seam hazard; not fixed here.

## Named follow-ons — DO NOT BUNDLE

**8F4-R4 · "_rollback() web scope"** — decide whether the automatic in-deploy `_rollback()`
(`deploy/deploy.sh`) should be widened from `up -d api worker` to also revert `web`.
A production `deploy.sh` change; its own propose→approve cycle, **after** 10d close.
Fix-or-affirm, operator call. Not part of this drill, not part of 10d.

**8F4-R6 · "CSP-delta rollback proof"** — the scoped drill's Caddyfile is byte-identical
across the pair, so CSP-delta reversion is UNPROVEN. This follow-on rides the next deploy
that actually changes `deploy/Caddyfile` (e.g. design-5.6 if it touches CSP): after that
deploy, a `workflow_dispatch` rollback must show the PRIOR CSP header served (operator
console walk). Until then, CSP reversion is recorded as unproven.

**"money-string consumer sweep" (CHARTERED 2026-07-25, NOT STARTED, own module, post-10d)** —
a SYSTEMATIC audit of **every** frontend consumer of a backend money/decimal field against
the serializer (this codebase returns KWD/decimal as 3-decimal STRINGS; frontend types often
claim `number`). NOT a third point-fix. Known instances of the one disease: (1) budgets-crash
typed-drift (2026-07-10, `budget_to_income_pct` `.toFixed(1)`) — FIXED, file-scoped to
`budget/sections.tsx`; (2) today's DashboardPage Recharts `.toFixed(3)` crash — same class,
unswept consumer; (3) the untriaged 15-day-old "budgets-page UI error" (2026-07-10 CSP
pre-flip record) — class uncharacterized, plausibly same, must be triaged. Three-going-on-four
recurrences; prior fixes left the rest unswept. Blind to `tsc` (types lie), to unit tests
(api-function-level mocks, `TODO(module-9-network-mocking)`), and to test-file typecheck
(`*.test.*` excluded). Strengthens `TODO(module-9-contract-validation)`. Do-not-bundle.

**DISC-C1 · "frontend error tracking" (CHARTERED 2026-07-25 — DISC-C1-ELEVATE; own item,
do-not-bundle, post-10d)** — ELEVATED from a finding to its own chartered item. Gap: `apps/web`
has NO error reporting of any kind (no `@sentry/*` dep; `ErrorBoundary` implements
`getDerivedStateFromError` only — no `componentDidCatch`; no `window.onerror`/
`unhandledrejection` handlers), while the backend has had Sentry since module 1a. Consequence:
a user-facing crash class is INVISIBLE — no event is produced, so neither frequency, recency,
nor affected-route data exists; the sole detector is an operator looking at a console.
**Sequencing note (recorded, NOT a ruling):** the chartered money-string consumer sweep can be
verified in tests but NOT in production while this gap stands — fixing blind and confirming
blind. Whether tracking precedes the sweep is an operator call at charter time, not decided
here.
