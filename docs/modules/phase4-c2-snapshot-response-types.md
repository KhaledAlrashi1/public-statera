# C2 fix-forward — SnapshotResponse KWD types (types-are-claims)

Frontend-only. The `SnapshotResponse` KWD fields are declared `number` while R13 returns
3-decimal STRINGS. Types are false claims; the fix is the frontend typing catching up to the
contract. Zero `apps/api` change. Carried out of phase4 SC-1/2 as `TODO(module-9-contract-validation)`
— C2 typed-drift.

Baselines: API **675 / 18 / 50**, exit 0, tsc 0 (must stay untouched — frontend-only);
frontend **166 / 35**, tsc 0 (must stay unchanged — no test add/remove).

---

## Phase A proposal (approved 2026-07-19, C2-A1..A4)

### Enumeration (evidenced)
`apps/web/src/types/api.ts` — 6 mistyped declarations:
- `SnapshotCashFlowWindow` (:357-361): `income_kd`/`expense_kd`/`net_kd` — all `number` (used by cash_flow 30d/60d/90d).
- `SnapshotResponse.net_position` (:383-387 inline): `income_total_kd`/`expense_total_kd`/`net_kd` — all `number`.

6 declaration lines → **12 runtime KWD values** (3 net_position + 9 cash-flow). `total_debt_kd`/
`total_savings_kd` confirmed GONE (SC-1/2) — the pre-SC "14" is corrected to 6 lines / 12 values.
Runtime is 3-decimal STRING per R13 (`formatKd` normalization; CLAUDE.md: "frontend types must
treat these fields as string, not number").

### Consumer audit
Sole consumer: `FinancialSnapshotHero` (`sections.tsx:1351-1440`). `api.ts:629` only returns the
envelope. (The many other `income_kd`/`expense_kd`/`net_kd` hits are the different
`dashboardMetrics.monthly` type — out of scope.)

| Field | Consumer | Class |
|---|---|---|
| net_position.income_total_kd | none | dead (declared, unused) |
| net_position.expense_total_kd | none | dead (declared, unused) |
| net_position.net_kd | 1390 `(np?.net_kd ?? 0) >= 0` · 1391 `formatKD(np?.net_kd ?? 0)` | (a) + tsc-forced |
| cash_flow[w].income_kd | 1422 `formatKD(cf?.income_kd ?? 0)` | (a) string-safe |
| cash_flow[w].expense_kd | 1430 `formatKD(cf?.expense_kd ?? 0)` | (a) string-safe |
| cash_flow[w].net_kd | 1435 `(cf?.net_kd ?? 0) >= 0` · 1436 `formatKD(cf?.net_kd ?? 0)` | (a) + tsc-forced |

- (a) string-safe = the 4 `formatKD(...)` calls (`formatKD(number|string|null|undefined)`,
  `utils.ts:19`, parseFloat internally) — work today, tsc-clean after flip.
- (b) live bug = **NONE.** No `.toFixed`/`+`/`.toLocaleString` on these fields. The two `>= 0`
  are relational → JS coerces the string operand (`"500.000" >= 0` → `500 >= 0`), so sign/color
  is correct today. No `a + b` concatenation consumer (prior-session warning) — confirmed absent.
- tsc-forced = the 2 comparisons (1390, 1435): after the flip `string | number >= number` is
  **TS2365**, surfacing exactly those two sites — the completeness proof of the audit.
- dead = income_total_kd, expense_total_kd.

### Fix shape
1. Flip the 6 declarations to `string` (incl. the 2 dead fields — D2).
2. The 2 tsc-forced sites → `Number(np?.net_kd ?? 0) >= 0` / `Number(cf?.net_kd ?? 0) >= 0`
   (display-sign logic, not money arithmetic; budgets-crash precedent — D1). The 4 formatKD calls
   change nothing.
3. Consumer form = display-only; no Decimal.js (convention governs money *arithmetic*, not a sign
   boolean or formatKD display).

### Test plan
- Primary gate = apps/web `tsc --noEmit`. Flip errors at 1390 & 1435 only; Number() clears them.
- No `SnapshotResponse` test fixture exists (grep NONE) → no fixture update; tsconfig test-exclusion
  gap moot here.
- Optional render test DECLINED (C2-A4) — no live bug to reproduce RED.
- Deltas: API 675/18/50 untouched; frontend 166/35 unchanged.

### Deviations
- D1 — `Number()` at the 2 sign sites (vs Decimal.js): APPROVED, Decimal DECLINED (C2-A2).
- D2 — flip the 2 dead fields with the rest: APPROVED (C2-A3).
- D3 — no regression test (tsc is the gate): APPROVED (C2-A4).

---

## Ruling — APPROVED (2026-07-19)
- **C2-A1:** enumeration + consumer audit accepted (6 decls / 12 values; stale count corrected;
  zero class-(b) live bugs; 4 formatKD string-safe; 2 tsc-forced; 2 dead).
- **C2-A2 (D1):** `Number()` at 1390 & 1435 APPROVED; Decimal DECLINED.
- **C2-A3 (D2):** flip the 2 dead fields with the rest APPROVED.
- **C2-A4 (D3):** tsc sufficient; optional render test DECLINED. **RECORD:** `FinancialSnapshotHero`
  is an UNTESTED component — inherited explicitly by any future frontend-coverage pass, not
  rediscovered.
- **C2-C1 (evidence condition):** close-out embeds THREE apps/web tsc states verbatim + exit codes:
  (i) pre-change clean baseline; (ii) flip-only — MUST show exactly two TS2365 at sections.tsx 1390
  & 1435 and nothing else (anything beyond the two sites is a finding); (iii) post-Number() clean.
  Plus API tsc, both suites' tails (API 675/18/50 untouched; frontend 166/35 unchanged), and the
  no-baseline-movement statement.

**SEQUENCE:** persist-first (this doc) → implement (frontend-only) → close-out per C2-C1.

---

## RECORD (C2-A4): FinancialSnapshotHero is untested
`FinancialSnapshotHero` (`apps/web/src/components/pages/dashboard/sections.tsx:1351`) — the sole
consumer of the `SnapshotResponse` KWD fields — has NO unit test (dashboard-hero.test.tsx covers
other cases). C2 corrected its field types under tsc only. A future frontend-coverage pass owns
adding a render test (string-valued snapshot → `"KD …"` + sign color). Recorded so it is inherited
explicitly, not rediscovered.
