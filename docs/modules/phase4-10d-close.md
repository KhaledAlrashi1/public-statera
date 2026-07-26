# Module 10d — CLOSE-OUT (2026-07-26)

Docs-only close. Every 10d work item is dispositioned. This is the canonical 10d close
record; CLAUDE.md's 10d entry + baseline line are the live index.

---

## 1. Item ledger (terminal state + closing ruling)

| Item | Terminal state | Closing ruling / date |
|---|---|---|
| 8f-2 restore drill | **DONE** — executed end-to-end, all stages PASS; re-purge timestamp-gate proven | Phase A approved 2026-07-07; drill run + close-out **2026-07-08** |
| 8f-3 uptime monitoring | **DONE — VERIFIED** (both induced-absence tests fired real alerts; dead-man + 2× UptimeRobot on `/healthz`+`/readyz`, never `/health`) | **2026-07-09** |
| CSP Report-Only → enforcing | **DONE** — enforcing live, post-flip console walk GREEN; original "zero-reports" criterion found VACUOUS | TODO(module-8e-csp-enforcement) CLOSED **2026-07-10** |
| Rate-limit backfill (budgets/categories/merchants/notifications) | **DONE** — `readRateLimit`/`writeRateLimit`/`heavyWriteRateLimit`; standard 429 envelope | TODO(phase4-rate-limit-backfill) **2026-07-10** |
| Zod adoption | **CLOSED** — B0 (2026-07-11) + B1 (2026-07-11) + B2-1..4 (2026-07-18); analytics/aggregation router uniformly zod on its rejecting shape layer. **Three standing dispositions (by design, not deferred):** money/transaction-input routes hand-rolled (B2-R8); auth+account routers hand-rolled (B2-CLOSE-3); `/summary` month looseness affirmed-harmless (B2-CLOSE-2) | TODO(phase4-zod-adoption) CLOSED **2026-07-18** (approvals `docs/modules/phase4-zod-adoption-b2-approvals.md`) |
| Docker log retention cap | **CLOSED-on-proof** — `json-file` caps on every prod service; `deploy.sh --remove-orphans`; **activation proven on-box** (DL-C2-AFTER: caps live on all 5 `statera-*`, `statera-nginx-1` gone) | DL, deployed `247824a`; **CLOSED 2026-07-19** (`docs/modules/phase4-docker-log-cap.md`) |
| Memorized-prune rule unification | **DONE** — unified onto count-tiered rule via `lib/memorized-prune.ts`; batch no longer prunes count≥3 idle>180d (client-observable) | TODO(memorized-prune-rule-unification), **Option A — operator ruling by delegation 2026-07-18** (`docs/modules/phase4-memorized-prune-unification.md`) |
| Integration rate-limit test isolation | **DONE** (test-only; `lib/rate-limit.ts` untouched) — `skipIf(INTEGRATION)` ×3 + isolated userId `9_000_001`; INTEGRATION full-suite green | TODO(integration-rate-limit-test-isolation), **RL-A1/RL-C4 2026-07-19** (`docs/modules/phase4-rate-limit-test-isolation.md`) |
| C2 fix-forward | **DONE** — `SnapshotResponse` 6 KWD fields number→string (types-are-claims); type-only + 2 `Number()` sign coercions, no runtime bug | commit `3ac360a`, **2026-07-20** (`docs/modules/phase4-c2-snapshot-response-types.md`) |
| Fuzzy-ratio equivalence fixture | **DONE** — Set A (35 ratio + 1 autojunk boundary, exact float) + Set B (24 boolean, Arabic/mixed/threshold) vs CPython difflib; 3 exports | TODO(fuzzy-ratio-equivalence-fixture), **FR-A1..A3/FR-C1..C6 2026-07-19** (`docs/modules/phase4-fuzzy-ratio-equivalence-fixture.md`) |
| 8f-4 deploy-rollback rehearsal | **DRILLED (scope-bounded)** — (i)/(iii)/(iv) PROVEN across 3 stages; **(ii) QUALIFIED, "clean-console rollback proof: NOT ACHIEVED"** | 8F4-ACCEPT **2026-07-25** (`docs/modules/phase4-8f4-rollback-drill.md`) |

### Completeness findings (10d-tagged in CLAUDE.md, NOT in the prompt's list)
- **10d-0 — deletion/re-login remediation: CLOSED 2026-07-07** (`a8b1ac4`, prod-verified). Three coupled fixes (purge revokes sessions + clears TOTP; reactivate-as-fresh; `/2fa/verify` audit hygiene). A genuine 10d work item omitted from the prompt's ledger — reported here for completeness; already closed, not an open gap.
- **10d attribution-provenance — `aa39718`** (CLAUDE.md-only standing-rule commit). Not a work item; the process yield is in §5. Flagged as a 10d-tagged commit outside the prompt's list.

---

## 2. Final baselines (evidenced)

**API hermetic** — `pnpm --filter statera-api test`, **exit 0**, no Errors/Unhandled section:
```
 Test Files  44 passed | 7 skipped (51)
      Tests  736 passed | 18 skipped (754)
```
**API tsc** — `pnpm --filter statera-api exec tsc --noEmit` → **exit 0** (no output).

**Frontend** — `pnpm --filter statera-frontend run test:unit`, **exit 0**, no Errors/Unhandled section:
```
 Test Files  35 passed (35)
      Tests  166 passed (166)
```
**Frontend tsc** — `pnpm --filter statera-frontend exec tsc --noEmit` → **exit 0** (no output).

**CLAUDE.md baseline line MATCHES** the hermetic result: "736 passed / 18 skipped / 0 failed across 51 files" (as of 10d fuzzy-ratio-equivalence-fixture) and frontend "166 tests / 35 files".

**API INTEGRATION** — last real run of record: **`50 files / 690 passed / 3 skipped / 0 failed, exit 0`** (2026-07-19, rate-limit-test-isolation; exit 0 is now the standard, no attribution — the former 4 known-noise failures were retired). **Not re-run this session — transparently:** (a) this 10d close is docs-only (no code, no `db.transaction()` boundary, no integration-case edit), so the integration-suite cadence rule does not mandate a fresh run; (b) a fresh host-pointed run was attempted but the dev-DB password is in the Read-guarded `.env` (compose-default `statera:statera` → `ER_ACCESS_DENIED_ERROR 1045`), and circumventing the secret guard to obtain it was declined; the migrate attempt failed at auth before any DDL, so the dev DB is untouched. **Caveat for the next runner:** the recorded 690 count PRE-DATES the fuzzy-ratio hermetic file, which also executes under `INTEGRATION=true` (pure functions, not gated) — expect **≈ +61** when the suite is next run by cadence.

---

## 3. Production state

- **Live SHA: `8260cd6`** (`8260cd65a568936276626a407c31e9da305667f0`).
- Probes: `/healthz` → `{"ok":true,"status":"healthy","version":"8260cd65...f0"}`; `/readyz` → `{"ok":true,"status":"ready","version":"8260cd65...f0"}` — **both SHA-matched.**
- **Docs riders ahead of live `origin/main`, awaiting the next FF:**
  - `b6738f1` phase-4: 8f-4 close-out (DRILLED, item (ii) qualified)
  - `5b87229` phase-4: DISC-C1-ELEVATE — charter TODO(frontend-error-tracking)
  - + this 10d close commit (docs-only).

---

## 4. Carried-forward ledger (out of 10d, with disposition)

- **money-string consumer sweep** — CHARTERED, NOT STARTED (own module, do-not-bundle, post-10d). Systematic audit of every frontend consumer of a backend money/decimal STRING field vs the serializer; not a point-fix. Out of 10d: a new remediation module, not ops-hardening.
- **frontend error tracking gap → TODO(frontend-error-tracking)** — CHARTERED (DISC-C1-ELEVATE, do-not-bundle, post-10d). `apps/web` has no error reporting of any kind. Out of 10d: surfaced by the 8f-4 drill, its own remediation charter.
- **"_rollback() web scope" (8F4-R4)** — named follow-on, do-not-bundle, after 10d close. Whether to widen auto-`_rollback()` from `api worker` to include `web` — a production `deploy.sh` change with its own cycle.
- **"CSP-delta rollback proof" (8F4-R6)** — queued follow-on; rides the next deploy that actually changes `deploy/Caddyfile`. Until then CSP-delta reversion is UNPROVEN (recorded).
- **"aggregation until residuals" — NOT CARRIED.** CONVERTED in **B2-4** (r6 expense-merchant-trend + dashboard-metrics → shared `UntilFormatSchema`; byte-identical, ordering preserved). This was the final B2 sub-commit; the residual is closed, not open.
- **untriaged 2026-07-10 budgets-page UI error** — OPEN triage; class uncharacterized in the record ("UI error"), plausibly the same `.toFixed`-on-KWD-string class. Folded into the money-string sweep's scope (must be triaged with it). Out of 10d: 15-day-old finding, belongs to the sweep.
- **Module 11 inheritances:** (a) **Arabic fuzzy-hint limitation (FR-C3)** — pure-Arabic names never receive fuzzy duplicate preview hints (guard short-circuit); exact dedup unaffected; faithful to Flask; Module 11 Arabic statement-parsing inherits it. (b) **R9-from-recurring-transactions note** — R9 safe-to-spend committed obligations could be derived from detected recurring transactions; Module 11 recurring-pattern work evaluates it.
- **GET/POST shared rate-limit-counter observation (RL-C1)** — RECORDED, not a defect: GET+POST on one path share one Redis counter (`rl:rl:{userId}:{path}`, double-prefixed) while carrying different limits. An OBSERVATION for a future product/ops disposition, not fixed.
- **summary-month-looseness (B2-CLOSE-2)** — AFFIRMED-harmless, NOT open. `/summary` month uses a looser regex (`/^\d{4}-\d{2}$/`, accepts "2024-99"); affirmed by design, not a carried gap.

---

## 5. Standing rules added / sharpened during 10d (quoted as they now read)

- **Evidence as a standalone document (persist-first):** *"A module's Phase A proposal and its approval block(s) are saved to `docs/modules/` as the module's **first action, before any implementation** — the approved lineage (rulings, conditions, verbatim spec sections, approved copy) must survive context compaction."*
- **Gates open on channel delivery (sequential gates):** *"Sequential gates are sequential. When a prompt requires a verification report … deliver the verification report and wait for explicit approval before starting the new work. An approval issued conditionally on a prior report being clean is not standing approval to ship in parallel."*
- **Exit-1-by-attribution retired (green = exit 0):** *"green = the exact CI command exits 0, asserted explicitly."* — pass/fail counts are not a verification; confirm no Errors/Unhandled/Unhandled-Rejection section. Applied to INTEGRATION by the rate-limit-test-isolation close: *"The INTEGRATION=true full-suite run is now GREEN: 50 files / 690 passed / 3 skipped / 0 failed, exit 0"* — exit 0 is the standard, no "known-noise" attribution.
- **Operator attestation is the weakest evidence class (8f-4 S2-RETRACT):** a "clean console" claim must carry ≥1 captured artifact per walk — the screenshot corrected the record. (Recorded in the 8f-4 close.)
- **Terminology guards on closed-by-design dispositions:** *"Do not describe the codebase as fully zod-validated or as 'no hand-rolled validation.'"* — money/Decimal parsing, business-rule checks, and diagnostic-order-sensitive checks stay hand-rolled by design; B2-CLOSE dispositions are "hand-rolled by design … NOT deferred/parked."
- **Attribution provenance:** *"Any report claim of the form 'per your ruling / approved / operator condition / operator-approved' MUST cite the specific review-channel block it derives from (date + block title)."* In-session `AskUserQuestion` selections are labelled "operator selection (in-session) — pending review-channel ratification" until ratified.

---

## 6. Handover statement → 10e (email magic-link authentication)

10e inherits a **green, hermetic baseline** (API 736/18/51 exit 0, tsc 0; frontend 166/35 exit 0, tsc 0) and an **INTEGRATION suite that is exit-0 by standard** (re-run by cadence when 10e touches a `db.transaction()` boundary or an integration case — which magic-link session issuance will). Architectural constraint unchanged and load-bearing: **NO password column, ever** (passkeys later); account-linking is **link-by-verified-email** (a magic-link request for an email already bound to Google attaches to the existing user, never a second account). 10e reworks auth under its own charter — the **auth + account routers are hand-rolled-by-design** (B2-CLOSE-3), so any zod there is 10e-scoped, proposed fresh, not inherited. Reuse: `createSessionToken`, the `totpEnabled` 2FA gate (replicate from the OIDC callback), the Redis rate-limit middleware, `auditSecurityEvent`. Two chartered post-10d items (`frontend-error-tracking`, money-string sweep) and the 8F4 follow-ons are do-not-bundle and do not block 10e.

**CLAUDE.md is accurate as the canonical handoff document** — the 10d entry reads "10d COMPLETE — all items closed", the baseline line matches §2, and every item in §1 is reflected there (plus the two completeness findings, 10d-0 and attribution-provenance, which are recorded in CLAUDE.md and surfaced here).

**Module 10d: CLOSED 2026-07-26.**
