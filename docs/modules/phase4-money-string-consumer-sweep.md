# Phase A charter — money-string consumer sweep

**Status:** PROPOSAL — awaiting review-channel approval. No application code changed in this session.
**Discipline:** serializer-field-first per operator ruling **SWEEP-R1** (2026-08-01, by delegation):
no priority surface; the sweep begins from the backend serializer outward, not from the known crash;
Recharts formatters are audited as ordinary enumeration, not as a starting point.
**Persist-first:** this document is the durable Phase-A lineage; implementation is a separate,
approved phase.

Baselines at charter time (must be held by any later implementation):
API hermetic **750 passed / 19 skipped / 53 files**; frontend **179 passed / 36 files**;
both `tsc --noEmit` = 0.

---

## 0. Headline findings (read first)

**F0 — The defect class is real, live, and currently crashing production on the dashboard.**
The still-open, "intermittent, data-dependent" `d.toFixed is not a function ('d.toFixed(3)')`
Recharts crash (recorded in the 8f4 rollback drill and in the C2 fix-forward as unexplained) is
**explained and root-caused by this sweep**: `expense_by_category` is serialized as **strings**
but typed `number`, and one consumer (`DashboardPage.tsx:286`) feeds those raw strings into a
Recharts tooltip formatter that calls `.toFixed(3)`. "Intermittent" = the formatter only runs on
tooltip hover, and only when the selected month has category data. (Found from the serializer per
SWEEP-R1 — not from the crash.)

**F1 — Money is NOT uniformly a string on the wire. There are TWO wire types, split by route.**
This is the single most important input to the durable control (A5) and it falsifies a naive
"all money is a branded string" fix:
- `formatKd(...)` / `Decimal.toFixed(3)` → **string** (`"12.500"`). Used by transactions, budgets,
  R3 dashboard-metrics, R4 account-overview, R9/R10, R11/R12, R13, budget-alerts, data-export.
- `roundedKd(...)` → **JS number** (`12.5`). Used by R1 spend-by-category, R2 spend-by-month,
  R5 expense-breakdown, R6 expense-merchant-trend, R7 budget-metrics.

A branded `Money` string type applied blanket-wise would be *wrong* for the `roundedKd` routes.
The authority is per-field, and the sweep must respect that.

**F2 — The class has exactly one live wire/type mismatch surface: `DashboardMetricsResponse` (R3).**
Across the entire emitted money surface, the only fields whose declared type contradicts the wire
type are the three R3 fields: `monthly[].income_kd`, `monthly[].expense_kd`
(typed `number`, wire `string`), and `expense_by_category`'s leaf values
(typed `number`, wire `string`). Every other money field's type matches its serializer (evidence in
A2). C2 already corrected the R13 `SnapshotResponse` set and *explicitly deferred* this R3
`dashboardMetrics.monthly` type as "out of scope" — this module is the promised follow-on.

**F3 — Point-fixes failed because the same bug lives in sibling files and tsc cannot see it.**
`ExpensesPage.tsx:763` reads the category map with `Number(value || 0)` (coerced, safe).
`DashboardPage.tsx:286` reads the *same map* with a bare `value` (uncoerced, crashes). The fix was
applied to one file and missed in its near-identical twin. Because the field is typed `number`,
`tsc` validates both as correct. This is the precise mechanism the module exists to close.

---

## A1 — The serialization authority

Money/decimal wire types are decided in the backend at these layers. There is **no single**
serializer; the authority is distributed, which is why an outward-from-serializer sweep is required.

**Primitive formatters** (`apps/api/src/lib/`):
- `kd.ts:3` `formatKd(value) → string` — `new Decimal(...).toFixed(3)`; the canonical **string** money type.
- `analytics-helpers.ts:61` `roundedKd(raw) → number` — `Number(new Decimal(...).toDecimalPlaces(3))`;
  the **number** money type (R1/R2/R5/R6/R7 only). File-top comment documents the JSON-shape deviation.
- `transaction-lib.ts` re-exports `formatKd`; `budgets.ts` also uses raw `Decimal.toFixed(3)` for
  `profile_context` (string).

**Emitting sites** (each produces money onto the wire):
- `routes/transactions.ts` (serializeTransaction, summary, search) — `formatKd` → string.
- `routes/budgets.ts:64,151,152` + `computeBudgetProfileContext` — `formatKd`/`toFixed` → string.
- `routes/aggregation.ts` — **mixed**: R1/R2/R5/R6 use `roundedKd` (number); R4/R7/R9/R10 use
  `formatKd` (string); see the file-top deviation block (`aggregation.ts:18-22`).
- `lib/dashboard-snapshot-lib.ts:222,223,230` (R3 `computeDashboardMetricsPayload`) — `formatKd` → **string**.
- `lib/intelligence-lib.ts` (R11/R12/R13) — `formatKd` → string.
- `lib/budget-alerts-lib.ts` + `worker/jobs/budget-alerts-job.ts` — `formatKd` → string; `ratio`/`threshold`
  via `Math.round`/`parseFloat` → number.
- `lib/data-export-lib.ts` — `formatKd` → string (GDPR export; no chart consumer).

Evidence — the R3 authority (the live-defect source), captured verbatim:

```
$ rg -n 'expense_by_category: Record<string, Record<string, string>>|income_kd: formatKd|expense_kd: formatKd|expenseByCategoryStr\[key\]\[cat\] = formatKd' apps/api/src/lib/dashboard-snapshot-lib.ts
48:  expense_by_category: Record<string, Record<string, string>>
222:    income_kd: formatKd(incomeByMonth[key] ?? new Decimal(0)),
223:    expense_kd: formatKd(expenseByMonth[key] ?? new Decimal(0)),
230:      expenseByCategoryStr[key][cat] = formatKd(dec)
```

The `apps/web` API layer performs **no** coercion — it is a typed passthrough
(`readApiData<T>` casts, it does not convert):

```
$ sed -n '554,561p' apps/web/src/lib/api.ts
  dashboardMetrics: async (params?: { months?: number; until?: string }) => {
    ...
    const payload = await apiFetch<unknown>(`/api/analytics/dashboard-metrics${suffix ? `?${suffix}` : ""}`)
    return readApiData<DashboardMetricsResponse>(payload)
  },
```

`rg 'z\.string|z\.number|coerce|parse\(' apps/web/src/lib/api.ts` → **no matches**: there is no
runtime guard at the frontend money boundary.

---

## A2 — Emitted money/decimal fields with actual wire type

Built from the serializers outward. "type OK?" compares wire type against
`apps/web/src/types/api.ts`.

| Route / source | Field(s) | Serializer | Wire type | Frontend type (api.ts) | type OK? |
|---|---|---|---|---|---|
| Transaction | `amount_kd` | formatKd | string | `string` (:47) | ✅ |
| Budget item | `amount_kd` | formatKd | string | `string` (:239) | ✅ |
| Budget profile_context | `budget_total_kd`, `monthly_income_kd`, `budget_to_income_pct` | toFixed | string / string\|null | `string`/`string\|null` (:250-253) | ✅ (fixed 2026-07-10) |
| R1 spend-by-category | map values | roundedKd | **number** | `number` (:67) | ✅ |
| R2 spend-by-month | `total_kd` | roundedKd | **number** | `number` (:63) | ✅ |
| **R3 dashboard-metrics** | **`monthly[].income_kd`, `monthly[].expense_kd`** | formatKd | **string** | **`number` (:85-86)** | ❌ **MISMATCH** |
| **R3 dashboard-metrics** | **`expense_by_category` leaf values** | formatKd | **string** | **`number` (:88)** | ❌ **MISMATCH (live crash)** |
| R4 account-overview | `total_spend_mtd`,`total_income_mtd`,`spend_mtd`,`amount_kd`,`month_trend.spend/income` | formatKd | string | `string` (:102-122) | ✅ |
| R4 account-overview | `top_categories[].pct` | Number(...) | number | `number` (:117) | ✅ |
| R5 expense-breakdown | `total_kd`, `items[].amount_kd` | roundedKd | **number** | `number` (:190,193) | ✅ |
| R6 expense-merchant-trend | `series[].total_kd` | roundedKd | **number** | `number` (:202) | ✅ |
| R7 budget-metrics | `spent_by_category`,`range_spent_by_category`,`avg12_by_category` | roundedKd | **number** | `Record<string,number>` (:73-75) | ✅ |
| R9 safe-to-spend | all `_kd` fields + breakdown | formatKd | string | `string` (:132-142) | ✅ |
| R10 weekly-digest | `this_week/last_week_expense_kd`,`top_categories[].amount_kd`,`safe_to_spend_today_kd` | formatKd | string | `string` (:223-231) | ✅ |
| R10 weekly-digest | `delta_pct` | _deltaPercent | number | `number` (:225) | ✅ |
| R11 income-pattern | `monthly_income_kd`,`suggested_monthly_income_kd` | formatKd | string\|null | `string\|null` (:161,164) | ✅ |
| R12 recurring-patterns | `avg_amount_kd` | formatKd | string | `string` (:209) | ✅ |
| R13 snapshot | `net_position.*`, `cash_flow[w].*` | formatKd | string | `string` (:360-389) | ✅ (fixed by C2) |
| Budget alert | `budget_kd`,`spent_kd` | formatKd | string | `string` (:178-179) | ✅ |
| Budget alert | `ratio`,`threshold` | Math.round/parseFloat | number | `number` (:180-181) | ✅ |

**Dead types (no runtime, no consumer — recorded, not swept):** `SpendingIntelligence*`
(`api.ts:313-351`, `*_kd: number`). The spendingIntelligence surface was removed in 9.5c; these
interfaces are orphaned type declarations with no backend route and no frontend caller. They are
NOT defects (nothing emits or consumes them). Flag for a future dead-type cleanup, out of scope here.

**Net:** the whole emitted surface is type-correct **except** the three R3 fields (F2).

---

## A3 — Consumers of the mismatched fields (+ search method + blind spots)

### Search method (stated explicitly)
1. `types/api.ts` grepped for every money-ish identifier declared `: number | : string`
   (`_kd|_mtd|amount|total|income|expense|spend|net_|budget|remaining|daily_rate|pct|reserve|committed|avg|sum`).
2. Backend grepped for every `formatKd` / `roundedKd` / `toFixed(3)` emit site (A1/A2).
3. For the mismatched fields (R3 `monthly.*_kd`, `expense_by_category`), the derived-variable names
   (`monthlyMetrics`, `expenseByCategoryByMonth`, `selectedMonthExpenseMap`, `prevMonthExpenseMap`,
   `categoryData`, `topExpenses`) were grepped across `apps/web` (excluding `*.test.*`), and each read
   classified for numeric treatment (`Number()`, arithmetic operators, `Math.*`, `.toFixed`, chart
   `dataKey`).

### Stated blind spots (a method with unstated blind spots is not a sweep)
- **Inline/local re-declarations:** chart component prop types (e.g. `categoryData:
  Array<{name; value: number}>` at `sections.tsx:1142`) re-assert `number` locally; a raw string
  flowing in is invisible to `tsc` at the boundary. Covered here by manual trace, not by grep alone.
- **Envelope escape hatch:** `ApiEnvelope` has `[key: string]: unknown` (`api.ts:411`); any field read
  off the raw envelope rather than the typed `data` bypasses the type entirely. None found for money,
  but the hatch exists.
- **Positional reads:** `Object.entries(map).sort((a,b)=>b[1]-a[1])` reads the value positionally
  (`[1]`) with no field name — grep for the field name misses these; found by tracing the map variable.
- **`*.test.*` excluded from typecheck** (tsconfig) — canonical drift-blindness, per TODO(module-9-network-mocking).
- **Not chased to leaf render:** a few number-typed-but-string values flow through arithmetic that
  coerces (division/subtraction) and are stored back onto number-typed objects; whether each such
  value later reaches a `.toFixed`/formatter is classified **uncertain** below rather than guessed.

### Consumer enumeration — R3 `monthly[].income_kd / expense_kd` (typed number, wire string)

| File:line | Read | Numeric treatment | Class |
|---|---|---|---|
| DashboardPage.tsx:109,110,119,120,126,270,271 | `Number(row.income_kd \|\| 0)` etc | explicit `Number()` | correct-by-coercion, **wrong type** |
| ExpensesPage.tsx:565,571 | `Number(row.expense_kd \|\| 0)` | explicit `Number()` | correct-by-coercion, **wrong type** |

Every `monthly.*_kd` consumer already coerces with `Number()`. **No live crash** on these two fields
today — but the type is a false claim, so a future consumer that trusts the `number` type and skips
`Number()` (the F3 mechanism) inherits a latent crash. Wrong-type / harmless-today.

### Consumer enumeration — R3 `expense_by_category` leaf values (typed number, wire string)

| File:line | Read | Numeric treatment | Class |
|---|---|---|---|
| **DashboardPage.tsx:285-287** | `Object.entries(map).map(([n,value])=>({name,value})).sort((a,b)=>b.value-a.value)` | **none** (bare string) → feeds `CategoryBreakdownChart` | **CRASHES** (see below) |
| DashboardPage.tsx:329-330 | `Object.entries(map).sort((a,b)=>b[1]-a[1])` | subtraction coerces | mis-typed; sort OK; value carried raw into `topExpensesWithSparklines` |
| DashboardPage.tsx:346-347 | `const total = map[month]?.[name] \|\| 0; {month, value: total}` | none → sparkline datum | **uncertain** (sparkline formatter unverified) |
| DashboardPage.tsx:369 | `reduce((s,m)=> s + (map[m]?.[name] \|\| 0), 0) / n` | `s + string` → **string concat** | **silently wrong** (NaN/garbage rolling average) |
| DashboardPage.tsx:384,389 | `const spent = map[b.category] \|\| 0` → stored `spent` | division/subtraction coerce; stored raw | **uncertain** (budgetTop.spent render unverified) |
| DashboardPage.tsx:413-415 | `Number(amountRaw \|\| 0)`, `Number(prevMonthExpenseMap[name] \|\| 0)` | explicit `Number()` | correct-by-coercion |
| DashboardPage.tsx:461,466 | `map[activeCategory] \|\| 0` | (downstream) | **uncertain** |
| ExpensesPage.tsx:763 | `.map(([n,value])=>({name, value: Number(value \|\| 0)}))` | **explicit `Number()`** | correct-by-coercion (the F3 twin that WAS fixed) |
| ExpensesPage.tsx:754 | `const total = map[month]?.[name] \|\| 0` | none → sparkline datum | **uncertain** |
| ExpensesPage.tsx:737 | `.sort((a,b)=>b[1]-a[1])` | subtraction coerces | mis-typed; sort OK |
| ExpensesPage.tsx:777,782 | `Number(map[activeCategory] \|\| 0)` | explicit `Number()` | correct-by-coercion |

**The live crash, traced end to end:**

```
$ sed -n '284,289p' apps/web/src/components/pages/DashboardPage.tsx
  const categoryData = useMemo(() => {
    return Object.entries(selectedMonthExpenseMap)
      .map(([name, value]) => ({ name, value }))        // value = "12.500" (string), typed number
      .sort((a, b) => b.value - a.value)                 // string subtraction: coerces, but value stays string
      .slice(0, 10)
  }, [selectedMonthExpenseMap])
```
`categoryData` (runtime `{name, value: string}[]`) → `<CategoryBreakdownChart categoryData={categoryData}/>`
(DashboardPage.tsx:841) → the Recharts tooltip formatter receives the raw datum value:
```
$ sed -n '1219,1221p' apps/web/src/components/pages/dashboard/sections.tsx
                  <RechartsTooltip
                    formatter={(value: number) => [`KD ${value.toFixed(3)}`, "Amount"]}
                    contentStyle={chartTooltipStyle}
```
`"12.500".toFixed` is `undefined` → **`value.toFixed is not a function`** on hover. Also
`sections.tsx:1146` `sum + row.value` (string concat) corrupts `totalSpend` and the "% of spending"
caption. The **ExpensesPage twin** (`763`) has `Number(value || 0)` and does not crash — the F3
divergence, made concrete.

---

## A4 — Classification summary

| Class | Fields / sites | Disposition |
|---|---|---|
| **crashes (live)** | `DashboardPage.tsx:286` (`categoryData` value) → `CategoryBreakdownChart` `.toFixed(3)` @ `sections.tsx:1220`, `sum+row.value` @ `1146/1153` | fix in implementation phase; reproduce RED first |
| **silently wrong** | `DashboardPage.tsx:369` rolling-average string-concat (`categoryTrendDeltas`) | fix (coerce); assert corrected value |
| **wrong type, harmless today** | `monthly[].income_kd/expense_kd` — all consumers already `Number()`-coerce (DashboardPage, ExpensesPage) | flip type to `string`; keep `Number()` coercions |
| **uncertain** | `DashboardPage.tsx:346` sparkline datum, `384/389` `budgetTop.spent`, `461/466`, `ExpensesPage.tsx:754` sparkline — arithmetic coerces but raw value stored on number-typed objects; leaf render not chased | implementation phase resolves each by trace, not by guess |
| **correct** | every non-R3 money field (A2); R6 (`roundedKd` number); ExpensesPage:763 (already coerced) | leave untouched |
| **dead type** | `SpendingIntelligence*` (`api.ts:313-351`) | out of scope; note for dead-type cleanup |
| **third untriaged budgets error (module premise)** | not reproduced this session; unknown class | NOT resolved by guess — see Open Questions Q3 |

---

## A5 — Durable control (recommendation)

Fixing the R3 instances without a control guarantees a fourth escape. Options evaluated against the
**two-wire-type reality (F1)** — any control that assumes "money is always a string" is disqualified.

**Option 1 — Branded `Money` string type (`type Money = string & {__brand}`).**
Blocks accidental arithmetic on string-money at compile time. *Rejected as the primary control:*
it models only the `formatKd` half; the `roundedKd` routes legitimately emit `number`. Branding
would either mislabel number routes or require two brands, and it still relies on the annotation
being correct (the exact thing that lied here). Cost: high churn, low incremental safety over Option 3.

**Option 2 — Runtime guard/coercion at the API boundary (`api.ts`).** A per-response normalizer that
coerces declared money fields to their true wire type before handing data to components. *Rejected as
primary:* requires a hand-maintained field registry per response (drift-prone), adds runtime cost, and
converts a mis-annotation into a silent behavior change rather than surfacing it.

**Option 3 — Extend contract validation (TODO(module-9-contract-validation)) with a wire-shape
assertion (RECOMMENDED).** The repo already has a contract test harness (10a) that resolves
`(method, path)` against mounted routes but does **not** assert response *shapes*. Add a fixture-backed
or backend-derived assertion that each frontend money field's declared type equals the serializer's
actual output. This is the only option that catches the class *mechanically at the type-vs-wire seam*
where all three prior escapes (9.1, budgets-crash, this R3 crash) originated, without assuming a single
money representation. Tradeoffs: needs a real wire sample per route (the existing contract-capture
harness + a small typed-shape checker, or MSW-level fixtures per TODO(module-9-network-mocking)); build
cost moderate (~1 sub-commit); ongoing cost low.

**Option 4 — ESLint rule banning numeric ops on money-typed values.** Complements but cannot replace:
it fires on the *annotation*, which is the false premise; it would not have flagged
`DashboardPage.tsx:286` because the field is typed `number` (the rule would see a legal
`number.toFixed`). Cost low; value low against this specific class. Optional add-on.

**Recommendation:** Option 3 as the durable control, with Option 4 as a cheap optional supplement.
Do **not** implement the control in the same sub-commit as the crash fix — land the crash fix first
(bounded, RED-provable), then the control (which will re-derive the same finding and lock it). Final
control scope is an operator decision (Q2).

---

## A6 — Proposed implementation plan (ordered sub-commits)

Each sub-commit is independently verifiable. Frontend-only unless a sub-commit is explicitly backend.
"Green" = the exact command exits 0 with no `Errors`/`Unhandled` section (not pass-counts).

**S1 — Flip the three R3 type declarations to their true wire type (`string`).**
`types/api.ts:85,86` → `string`; `:88` → `Record<string, Record<string, string>>`. This is the
completeness engine: `tsc` will then surface **every** consumer that treats the value as a number
without coercion (the F3-invisible sites become visible). Expected `tsc` errors: the uncoerced
`DashboardPage` sites (286 sort, 346, 369, 384) — captured verbatim in the close-out as the audit's
proof-of-completeness (mirrors C2-C1).
Verify: `pnpm --filter statera-frontend exec tsc --noEmit` (capture the intermediate error set), then 0 after S2.

**S2 — Coerce every site `tsc` surfaced; RED-prove the live crash first.**
Add `Number(... || 0)` at each uncoerced site (`DashboardPage.tsx:286` `value: Number(value||0)`,
`346`, `369`, `384`, and any other surfaced by S1), matching the already-correct `ExpensesPage.tsx:763`
form. Before fixing `286`, add a render/interaction test that drives `CategoryBreakdownChart` with a
string-valued `expense_by_category` fixture and asserts the tooltip formatter renders `"KD 12.500"`
(fails RED with `toFixed is not a function` against the unfixed component — the budgets-crash
precedent). Resolve each **uncertain** A4 site by trace, not guess.
Verify: `pnpm --filter statera-frontend run test:unit` exits 0 (+ the new RED→green case);
`tsc --noEmit` = 0.

**S3 — Durable control (Option 3), separate commit (scope pending Q2).**
Extend the contract layer with a money-field wire-shape assertion so a future R3-class mis-annotation
fails CI. Backend + frontend contract test.
Verify: `pnpm --filter statera-api exec vitest run src/contract` exits 0;
`pnpm --filter statera-frontend run test:unit` exits 0.

**S4 (optional) — dead-type + ESLint supplement.** Remove `SpendingIntelligence*` dead types; add the
Option-4 lint rule if approved.
Verify: both suites + both `tsc --noEmit` exit 0.

Every close-out embeds, per the mandatory-sections rule: the verbatim test tail incl. the
`Test Files N passed (N)` line + captured exit code; the verbatim `tsc --noEmit` output + exit code;
and the baseline-diff hunk if counts move.

---

## R14 note — findings that could reshape the module (reported, not resolved)

- **The open dashboard crash is IN scope and root-caused here** (F0). The module was chartered as a
  consumer sweep; the sweep's first serializer-out pass landed on the exact live crash. No shape change
  — reported so the operator knows S2 closes a standing production defect, not only a latent one.
- **Two wire types coexist (F1).** This materially constrains A5 (kills the naive branded-string
  control). Surfaced as a headline rather than resolved autonomously; the control choice is Q2.
- **The module premise's "third untriaged budgets error" was NOT reproduced** and is not assumed to be
  this class (Q3). Not resolved by guess, per A4 discipline.

## Open questions for the operator (superseded — see REVISION 1 rulings)

- **Q1 — Sub-commit split.** Approve S1+S2 as one crash-fix commit, or two? (Recommendation: one
  frontend commit S1+S2; control S3 separate.)
- **Q2 — Durable control scope.** Option 3 (contract wire-shape assertion) as recommended? Include the
  Option-4 lint supplement? Or crash-fix only this module and spin the control into
  TODO(module-9-contract-validation) as its own module?
- **Q3 — Third untriaged budgets error.** Do you want this module to attempt reproduction of the
  15-day-old untriaged budgets-page UI error (module premise), or is that explicitly out of scope for
  the sweep (it may be a different class)? A4 leaves it unresolved rather than guessed.
- **Q4 — `FinancialSnapshotHero` untested (C2 record).** The C2 fix-forward recorded that the sole
  `SnapshotResponse` consumer has no render test. Fold a render test into S2's coverage, or leave to a
  dedicated frontend-coverage pass?

---
---

# REVISION 1 (2026-08-01) — owed deliverables + S1 proving test + DOCS-2

Responds to the operator's non-approval note. Delivers the full A2/A3 tables inline (portable
`file:line` text, no IDE links), the A3 search method, the empirical S1 flip result (Part 2), and the
DOCS-2 ground-truth correction (Part 3). Operator rulings Q1–Q4 folded in. **No application code
committed this session** — the Part-2 flip was applied locally, captured, and reverted (working tree
clean, verified).

## PART 2 — S1 proving test (the gate) — RESULT: **PASS**

Method exactly as instructed: flipped the three R3 declarations in `apps/web/src/types/api.ts`
(`monthly[].income_kd`/`expense_kd` `number`→`string`; `expense_by_category`
`Record<string,Record<string,number>>`→`Record<string,Record<string,string>>`), ran
`pnpm --filter statera-frontend exec tsc --noEmit`, did NOT commit, then reverted.

Pre-flip: `tsc --noEmit` exit **0** (clean baseline).

Flip-only `tsc --noEmit` output (verbatim, exit **1**):

```
src/components/pages/DashboardPage.tsx(287,23): error TS2362: The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(287,33): error TS2363: The right-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(330,23): error TS2362: The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(330,30): error TS2363: The right-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(369,45): error TS2365: Operator '+' cannot be applied to types 'number' and 'string | number'.
src/components/pages/DashboardPage.tsx(385,41): error TS2362: The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(391,29): error TS2362: The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(396,36): error TS2362: The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(396,46): error TS2363: The right-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(469,46): error TS2362: The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(470,25): error TS2362: The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(470,41): error TS2363: The right-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(471,28): error TS2365: Operator '>' cannot be applied to types 'string | number' and 'number'.
src/components/pages/DashboardPage.tsx(471,69): error TS2363: The right-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/DashboardPage.tsx(824,13): error TS2322: Type '{ category: string; allocated: number; spent: string | number; usedPct: number; over: number; }[]' is not assignable to type '{ category: string; allocated: number; spent: number; usedPct: number; over: number; }[]'.
  Type '{ category: string; allocated: number; spent: string | number; usedPct: number; over: number; }' is not assignable to type '{ category: string; allocated: number; spent: number; usedPct: number; over: number; }'.
    Types of property 'spent' are incompatible.
      Type 'string | number' is not assignable to type 'number'.
        Type 'string' is not assignable to type 'number'.
src/components/pages/DashboardPage.tsx(832,13): error TS2322: Type '{ name: string; value: string; sparklineData: { month: string; value: string | number; }[]; }[]' is not assignable to type '{ name: string; value: number; sparklineData: { month: string; value: number; }[]; }[]'.
  Type '{ name: string; value: string; sparklineData: { month: string; value: string | number; }[]; }' is not assignable to type '{ name: string; value: number; sparklineData: { month: string; value: number; }[]; }'.
    Types of property 'value' are incompatible.
      Type 'string' is not assignable to type 'number'.
src/components/pages/DashboardPage.tsx(841,15): error TS2322: Type '{ name: string; value: string; }[]' is not assignable to type '{ name: string; value: number; }[]'.
  Type '{ name: string; value: string; }' is not assignable to type '{ name: string; value: number; }'.
    Types of property 'value' are incompatible.
      Type 'string' is not assignable to type 'number'.
src/components/pages/DashboardPage.tsx(862,13): error TS2322: Type 'string | number' is not assignable to type 'number'.
  Type 'string' is not assignable to type 'number'.
src/components/pages/DashboardPage.tsx(866,13): error TS2322: Type 'string | number' is not assignable to type 'number'.
  Type 'string' is not assignable to type 'number'.
src/components/pages/ExpensesPage.tsx(737,23): error TS2362: The left-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/ExpensesPage.tsx(737,30): error TS2363: The right-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/pages/ExpensesPage.tsx(1016,70): error TS2322: Type '{ name: string; value: string; sparklineData: { month: string; value: string | number; }[]; }[]' is not assignable to type '{ name: string; value: number; sparklineData: { month: string; value: number; }[]; }[]'.
  Type '{ name: string; value: string; sparklineData: { month: string; value: string | number; }[]; }' is not assignable to type '{ name: string; value: number; sparklineData: { month: string; value: number; }[]; }'.
    Types of property 'value' are incompatible.
      Type 'string' is not assignable to type 'number'.
```

Post-revert: `tsc --noEmit` exit **0**; `git status --short apps/web/src/types/api.ts` empty (clean).

**Plain verdict on the operator's test — does an error appear at, or trace to,
`DashboardPage.tsx:286` / `sections.tsx:1220`?** **YES.**
- `DashboardPage.tsx:286` is the `categoryData` `useMemo` block (lines 284–289). The flip errors at
  **`287,23`/`287,33`** — the `.sort((a,b)=>b.value-a.value)` on the very next line of that block —
  and again at **`841,15`**, which is the `<CategoryBreakdownChart categoryData={categoryData} />`
  prop pass: `{name; value: string}[]` is not assignable to the chart prop `{name; value: number}[]`.
- **`sections.tsx:1220`** is the crash formatter `formatter={(value: number) => KD ${value.toFixed(3)}`
  inside `CategoryBreakdownChart`. It does not itself error (its param is internally typed `number`),
  but the flip **blocks the only data path that reaches it** at `DashboardPage.tsx:841` — the string
  array cannot be handed to the component, which is exactly the fix site. The trace is: flip → `841`
  prop-type error → `CategoryBreakdownChart(categoryData)` → the `.toFixed(3)` consumer. The known
  crash consumer is surfaced.

**Why the operator's two holes did not defeat the proof (empirically):**
1. *Recharts `any` formatter:* even though the formatter param is `number` (and would be equally
   inert if `any`), the flip is caught **upstream at the prop boundary** (`sections.tsx` prop type
   `categoryData: Array<{value: number}>`, error at `841`) and at the **arithmetic** in the data
   builder (`287`). The completeness proof does not depend on the formatter callback being typed.
2. *`Object.entries(map || {})` widening to `[string, any][]`:* did **not** occur — the errors at
   `287`/`330`/`737` prove `value` resolved to `string`/`string|number`, not `any`. The `|| {}`
   fallback did not erase the value type.

**The flip also out-performed the manual A3 grep** — it pinned every one of REVISION-0's "uncertain"
sites as a hard type error (`385/391/396` budgetTop.spent, `469–471` activeCategory, `832/862/866`
sparkline, `824` budgetTop prop, `1016` ExpensesPage sparkline). This is the completeness engine
working: S1's captured error set IS the exhaustive consumer list, including the sites grep classified
as uncertain.

**Conclusion:** the S1 mechanism holds; the flip-only capture is a valid completeness proof. Per Q1,
S1+S2 combine into one commit and this capture is its required evidence artifact (not a committed
state). No R14 shape change.

**Standing caveat (unchanged, stated so it is not mistaken for a gap):** `tsc` excludes `*.test.*`,
so any money consumer inside a test file is invisible to this proof. See A3 search method §blind-spots
and Q4 (FinancialSnapshotHero test, now approved into S2).

## PART 1 — A2 in full (every emitted money/decimal field, wire type, serializer path)

Serializer primitives: `apps/api/src/lib/kd.ts:3` `formatKd → string` (`Decimal.toFixed(3)`);
`apps/api/src/lib/analytics-helpers.ts:61` `roundedKd → number` (`Number(Decimal.toDecimalPlaces(3))`).
"Money kind": **str** = string on the wire; **num** = JS number; **pct/ratio** = number by design
(a percentage/ratio, not a KWD amount). "type OK?" compares wire vs `apps/web/src/types/api.ts`.

| # | Route / source | Field(s) | Serializer path | Wire | api.ts decl (line) | OK? |
|---|---|---|---|---|---|---|
| 1 | Transactions | `amount_kd` | `routes/transactions.ts:282,402,603,654` `formatKd` | str | `Transaction.amount_kd: string` (:47) | ✅ |
| 2 | Transactions /summary | `sum_kd` | `routes/transactions.ts:800` `formatKd` | str | (local/summary; string) | ✅ |
| 3 | Budgets | `items[].amount_kd` | `routes/budgets.ts:64` `formatKd` | str | `BudgetItem.amount_kd: string` (:239) | ✅ |
| 4 | Budgets profile_context | `budget_total_kd` | `routes/budgets.ts:151` `Decimal.toFixed(3)` | str | `string` (:250) | ✅ |
| 5 | Budgets profile_context | `monthly_income_kd` | `routes/budgets.ts:152` `toFixed(3)` | str\|null | `string\|null` (:251) | ✅ |
| 6 | Budgets profile_context | `budget_to_income_pct` | `routes/budgets.ts:147` `toFixed(1)` | str\|null | `string\|null` (:253) | ✅ (fixed 2026-07-10) |
| 7 | R1 spend-by-category | map values | `routes/aggregation.ts:127` `roundedKd` | num | `SpendByCategory` `[k]: number` (:67) | ✅ |
| 8 | R2 spend-by-month | `total_kd` | `routes/aggregation.ts:150` `roundedKd` | num | `SpendByMonth.total_kd: number` (:63) | ✅ |
| 9 | **R3 dashboard-metrics** | **`monthly[].income_kd`** | `lib/dashboard-snapshot-lib.ts:222` `formatKd` | **str** | **`number` (:85)** | ❌ |
| 10 | **R3 dashboard-metrics** | **`monthly[].expense_kd`** | `lib/dashboard-snapshot-lib.ts:223` `formatKd` | **str** | **`number` (:86)** | ❌ |
| 11 | **R3 dashboard-metrics** | **`expense_by_category` leaf** | `lib/dashboard-snapshot-lib.ts:230` `formatKd` (decl `:48`) | **str** | **`Record<Record<number>>` (:88)** | ❌ (LIVE CRASH) |
| 12 | R4 account-overview | `total_spend_mtd`,`total_income_mtd` | `routes/aggregation.ts:868,869` `formatKd` | str | `string` (:107,108) | ✅ |
| 13 | R4 account-overview | `manual_entry_summary.spend_mtd` | `routes/aggregation.ts:873` `formatKd` | str | `string` (:112) | ✅ |
| 14 | R4 account-overview | `top_categories[].amount_kd` | `routes/aggregation.ts:838` `formatKd` | str | `string` (:116) | ✅ |
| 15 | R4 account-overview | `top_categories[].pct` | `routes/aggregation.ts:836` `Number(...)` | pct | `number` (:117) | ✅ |
| 16 | R4 account-overview | `month_trend[].spend`,`.income` | `routes/aggregation.ts:856,857` `formatKd` | str | `string` (:121,122) | ✅ |
| 17 | R5 expense-breakdown | `total_kd` | `routes/aggregation.ts:235` `roundedKd` | num | `number` (:190) | ✅ |
| 18 | R5 expense-breakdown | `items[].amount_kd` | `routes/aggregation.ts:249,261,276` `roundedKd` | num | `number` (:193) | ✅ |
| 19 | R6 expense-merchant-trend | `series[].total_kd` | `routes/aggregation.ts:339,341` `roundedKd` | num | `number` (:202) | ✅ |
| 20 | R7 budget-metrics | `spent_by_category` | `routes/aggregation.ts:418` `roundedKd` | num | `Record<number>` (:73) | ✅ |
| 21 | R7 budget-metrics | `range_spent_by_category` | `routes/aggregation.ts:446` `roundedKd` | num | `Record<number>` (:74) | ✅ |
| 22 | R7 budget-metrics | `avg12_by_category` | `routes/aggregation.ts:475` `roundedKd` | num | `Record<number>` (:75) | ✅ |
| 23 | R9 safe-to-spend | `monthly_income_kd` | `routes/aggregation.ts:710` `formatKd` | str\|null | `string\|null` (:132) | ✅ |
| 24 | R9 safe-to-spend | `total_budget_kd`,`committed_kd`,`committed_breakdown_kd.budget_allocations`,`actual_spend_kd`,`remaining_budget_kd`,`daily_rate_kd` | `routes/aggregation.ts:713–720` `formatKd` | str | `string` (:135–142) | ✅ |
| 25 | R10 weekly-digest | `this_week_expense_kd`,`last_week_expense_kd` | `routes/aggregation.ts:1042,1043` `formatKd` | str | `string` (:223,224) | ✅ |
| 26 | R10 weekly-digest | `top_categories[].amount_kd` | `routes/aggregation.ts:1028` `formatKd` | str | `string` (:228) | ✅ |
| 27 | R10 weekly-digest | `safe_to_spend_today_kd` | `routes/aggregation.ts:1047` `String(...)` of formatKd | str | `string` (:231) | ✅ |
| 28 | R10 weekly-digest | `delta_pct` | `routes/aggregation.ts:969` `_deltaPercent` num | pct | `number` (:225) | ✅ |
| 29 | R11 income-pattern | `monthly_income_kd`,`suggested_monthly_income_kd` | `lib/intelligence-lib.ts:349,509` `formatKd` | str\|null | `string\|null` (:161,164) | ✅ |
| 30 | R12 recurring-patterns | `avg_amount_kd` | `lib/intelligence-lib.ts:298` `formatKd` | str | `string` (:209) | ✅ |
| 31 | R13 snapshot | `net_position.*`, `cash_flow[w].*` | `lib/intelligence-lib.ts:589–603` `formatKd` | str | `string` (:360–389) | ✅ (fixed by C2) |
| 32 | Budget alerts | `budget_kd`,`spent_kd` | `worker/jobs/budget-alerts-job.ts:90,91` `formatKd` | str | `string` (:178,179) | ✅ |
| 33 | Budget alerts | `ratio`,`threshold` | `lib/budget-alerts-lib.ts:218,219` `Math.round/parseFloat` | ratio | `number` (:180,181) | ✅ |
| 34 | Account (auth) profile | `monthly_income_kd` | `routes/auth.ts:884,1051` `formatKd` | str\|null | `UserProfile.monthly_income_kd: string\|null` (:436) | ✅ |
| 35 | Data-export (GDPR) | `monthly_income_kd`, `transactions[].amount_kd`, `budgets[].amount_kd` | `lib/data-export-lib.ts:310,334,345` `formatKd` | str | (no typed frontend consumer; blob download) | ✅ n/a |

**Dead types (no emitter, no consumer):** `SpendingIntelligence*` (`api.ts:313–351`, `*_kd: number`).
The surface was removed in 9.5c. Not defects (nothing emits/consumes them). Out of scope; noted for a
future dead-type cleanup.

**A2 completeness statement:** every money/decimal field emitted by the API is in the table above.
Rows 9/10/11 (R3) are the only wire-vs-type mismatches. All other rows match. This is the basis of the
"exactly one live mismatch surface" claim, and Part 2's flip independently corroborates it — the flip
errored **only** in the two files that consume R3 (`DashboardPage.tsx`, `ExpensesPage.tsx`) and nowhere
else in the codebase.

## PART 1 — A3 in full (consumers of the mismatched R3 fields)

Because A2 proves R3 is the only mismatch, A3 enumerates consumers of rows 9/10/11 exhaustively.
`file:line`, the read, declared vs runtime, numeric treatment, and A4 class. The flip (Part 2) is the
authority for numeric-treatment sites (a bare `Number()`-absent read that the flip did NOT flag is
genuinely string-safe; every flip error line is an uncoerced consumer).

### Rows 9/10 — `monthly[].income_kd` / `expense_kd` (decl `number`, wire `string`)

| file:line | read | numeric treatment | flip-flagged? | class |
|---|---|---|---|---|
| DashboardPage.tsx:109,110 | `Number(row.income_kd\|\|0)`,`Number(row.expense_kd\|\|0)` | explicit `Number()` | no | wrong-type, harmless |
| DashboardPage.tsx:119,120 | `Number(row.income_kd\|\|0)`,`Number(row.expense_kd\|\|0)` | explicit `Number()` | no | wrong-type, harmless |
| DashboardPage.tsx:126 | `Number(row.expense_kd\|\|0)>0` | explicit `Number()` | no | wrong-type, harmless |
| DashboardPage.tsx:270,271 | `Number(row.income_kd\|\|0)`,`Number(row.expense_kd\|\|0)` (trendData) | explicit `Number()` | no | wrong-type, harmless |
| ExpensesPage.tsx:565 | `Number(row.expense_kd\|\|0)>0` | explicit `Number()` | no | wrong-type, harmless |
| ExpensesPage.tsx:571 | `Number(row.expense_kd\|\|0)` | explicit `Number()` | no | wrong-type, harmless |

All `monthly.*_kd` consumers already coerce → no live crash; type is a false claim (latent per F3).

### Row 11 — `expense_by_category` leaf (decl `number`, wire `string`)

| file:line | read (via `selectedMonthExpenseMap`/`prevMonthExpenseMap`/`expenseByCategoryByMonth`) | numeric treatment | flip line | class |
|---|---|---|---|---|
| DashboardPage.tsx:285–287 | `categoryData`: `.map(([n,value])=>({name,value})).sort((a,b)=>b.value-a.value)` | **none** (raw) | **287** | **CRASHES** → `sections.tsx:1220` via prop `:841` |
| DashboardPage.tsx:329–330 | `topExpenses`: `.sort((a,b)=>b[1]-a[1])` then value carried raw | subtraction coerces; value stored raw | **330** | mis-typed → feeds 832 |
| DashboardPage.tsx:344–349 | `sparklineData`: `{month, value: map[m]?.[name]\|\|0}` | none | **862/866** (via 832 prop) | silently-wrong / crash-adjacent |
| DashboardPage.tsx:369 | `categoryTrendDeltas`: `reduce((s,m)=>s+(map[m]?.[name]\|\|0),0)/n` | `s+string` concat | **369** | **silently wrong** (garbage rolling avg) |
| DashboardPage.tsx:384–396 | `budgetTop`: `spent=map[cat]\|\|0`; `spent/allocated`, `spent-allocated`, sort `b.spent-a.spent` | arithmetic coerces; `spent` stored raw | **385/391/396** | mis-typed → crash at prop 824 |
| DashboardPage.tsx:413–415 | `risingCategory`: `Number(amountRaw\|\|0)`,`Number(prev\|\|0)` | explicit `Number()` | no | correct-by-coercion |
| DashboardPage.tsx:461,469–471 | activeCategory amount: `map[activeCategory]\|\|0`, `>0`, `- prev` | none | **469/470/471** | mis-typed |
| DashboardPage.tsx:824 | `<...budgetTop=...>` prop pass (`spent: string\|number`) | — | **824** | prop-boundary catch |
| DashboardPage.tsx:832 | `topExpensesWithSparklines` prop pass | — | **832** | prop-boundary catch |
| DashboardPage.tsx:841 | `<CategoryBreakdownChart categoryData=...>` prop pass | — | **841** | **prop-boundary catch → the crash feed** |
| DashboardPage.tsx:862,866 | sparkline `value:` assignments | — | **862/866** | mis-typed |
| ExpensesPage.tsx:737 | `topExpenses`: `.sort((a,b)=>b[1]-a[1])` | subtraction coerces | **737** | mis-typed |
| ExpensesPage.tsx:763 | `categoryData`: `.map(([n,value])=>({name, value: Number(value\|\|0)}))` | **explicit `Number()`** | no | correct-by-coercion (F3 twin — fixed) |
| ExpensesPage.tsx:754 | sparkline `total = map[m]?.[name]\|\|0` | none | **1016** (via prop) | mis-typed |
| ExpensesPage.tsx:777,782 | `Number(map[activeCategory]\|\|0)`,`Number(prev\|\|0)` | explicit `Number()` | no | correct-by-coercion |

Downstream crash site (unchanged from REVISION 0):
`sections.tsx:1146` `sum + row.value` (string concat) and `sections.tsx:1220`
`formatter={(value:number)=>KD ${value.toFixed(3)}}` — reached only via `DashboardPage.tsx:841`.

## PART 1 — A3 search method (explicit, with blind spots)

**What was searched, with what patterns, across what paths:**
1. `apps/web/src/types/api.ts` grepped for money-ish identifiers declared `: number|: string`
   (`_kd|_mtd|amount|total|income|expense|spend|net_|budget|remaining|daily_rate|pct|reserve|committed|avg|sum|price|cost`).
2. `apps/api/src/{routes,lib,worker}` grepped for `formatKd|roundedKd|toFixed\(3\)` to enumerate every
   emit site (A1/A2), then each read directly to confirm the wire type.
3. For rows 9/10/11, the derived-variable names (`monthlyMetrics`, `expenseByCategoryByMonth`,
   `selectedMonthExpenseMap`, `prevMonthExpenseMap`, `categoryData`, `topExpenses`,
   `topExpensesWithSparklines`, `budgetTop`, `categoryTrendDeltas`, `sparklineData`) grepped across
   `apps/web/src` (excluding `*.test.*`), each read classified for numeric treatment.
4. **Empirical closure (S1 flip):** the type-flip run in Part 2 is the authoritative enumerator for
   numeric-treatment sites — it surfaces *every* uncoerced consumer regardless of the variable name or
   access form. The grep of §1–3 is corroborated by, and subordinate to, the flip's captured error set.

**What could slip through grep (blind spots), and how addressed:**
- **Dynamic / positional property access** (`Object.entries(map).sort((a,b)=>b[1]-a[1])`,
  `map[activeCategory]`, `map[month]?.[name]`) — the field name never appears; a name-grep misses
  these. Addressed by (a) tracing the *map variable* not the field, and (b) the S1 flip, which flags
  positional arithmetic (`330,23`, `737,23`, `469–471`) with no reliance on a field name.
- **Values passed through intermediate variables/props before numeric treatment** — e.g.
  `spent`(384)→prop(824), `categoryData`(286)→prop(841)→`CategoryBreakdownChart`→`.toFixed`(1220);
  `value`(346)→`sparklineData`→prop(832). Grep on the field name cannot follow the value across a
  binding. Addressed by the flip: TS propagates the string type through the intermediates and errors at
  the **prop boundary** (`824/832/841/1016`), which is precisely where the value crosses into a
  number-typed consumer. This is the mechanism that makes S1 a valid completeness proof.
- **Consumers in `*.test.*` files** — `tsconfig` excludes `*.test.*` from typecheck, so the S1 flip is
  blind to them by construction, and a mocked numeric fixture in a test would not reproduce the wire
  string anyway (TODO(module-9-network-mocking)). Handled two ways: (a) a manual `rg` over
  `apps/web/src/**/*.test.*` for `income_kd|expense_kd|expense_by_category` is a required S2 pre-step to
  find any test that hard-codes a numeric fixture for these fields (such a fixture is itself a false
  premise and must be flipped to string); (b) Q4's approved `FinancialSnapshotHero`/category-chart
  render test in S2 asserts against a **string-valued** fixture, exercising the real wire shape that the
  mock layer otherwise hides. Stated plainly: **the S1 flip does not and cannot prove test-file
  completeness; S2's manual test-file grep + the string-fixture render test cover that gap.**

## PART 3 — DOCS-2: ground-truth correction (money is not uniformly string on the wire)

**Process note acknowledged:** this should have been raised as an R14 stop-and-ask in the first pass,
not a headline bullet. Recorded.

### 3a — Exact CLAUDE.md text that is wrong

**Target 1 — `CLAUDE.md:522`** (R13 contract entry), the load-bearing over-generalization:
> "...Hono normalizes to strings via `formatKd` to match the **project-wide KWD-as-string convention
> used by R3/R4/R9/R10/R11/R12**."

The phrase "project-wide KWD-as-string convention" is false: R1/R2/R5/R6/R7 emit **numbers** via
`roundedKd`. (The route list it cites — R3/R4/R9/R10/R11/R12 — happens to be string-correct, but the
"project-wide" framing asserts a universality the codebase does not have.)

**Target 2 — `CLAUDE.md:380`** (standing rule), correct at the DB layer but misleading as stated:
> "**Decimal.js for ALL arithmetic on KWD amounts.** Drizzle decimal returns strings — never pass to
> `Number()` or use `+` arithmetic..."

True that *Drizzle* returns strings and that *arithmetic* must use Decimal.js. But "never pass to
`Number()`" reads as a blanket wire claim, and the analytics layer **deliberately** does
`Number(Decimal.toDecimalPlaces(3))` in `roundedKd` to emit number money. The rule is about
*arithmetic inputs*, not *serialized outputs*; it should say so.

(Note: `apps/api/src/routes/aggregation.ts:18–22` already documents the per-route split accurately in
code — CLAUDE.md simply never absorbed it.)

### 3b — Proposed replacement wording

**Replace `CLAUDE.md:522` clause** "to match the project-wide KWD-as-string convention used by
R3/R4/R9/R10/R11/R12" with:
> "to match the string-money serialization used by R3/R4/R9/R10/R11/R12. **Money serialization is NOT
> uniform: string routes use `formatKd`; the `roundedKd` routes (R1 spend-by-category, R2
> spend-by-month, R5 expense-breakdown, R6 expense-merchant-trend, R7 budget-metrics) emit JS
> *numbers*. See the definitive per-route list under 'Key architectural decisions'.**"

**Append to the `CLAUDE.md:380` standing rule** a clarifying sentence:
> "This governs arithmetic *inputs* (Drizzle decimal strings), not serialized *outputs*: the analytics
> layer deliberately emits number money via `roundedKd` (`Number(Decimal.toDecimalPlaces(3))`) on
> R1/R2/R5/R6/R7. Whether a given API field is a string or a number on the wire is per-route — see the
> definitive list."

**Add a new bullet under "Key architectural decisions (do not revisit)"** carrying the definitive list
(3c below), so it is ground truth rather than buried in a route comment.

### 3c — Definitive per-route money serialization list (from A2, serializer-read)

- **String money (`formatKd` / `Decimal.toFixed`)** — the majority:
  transactions (`amount_kd`, `sum_kd`), budgets (`amount_kd` + `profile_context.*`),
  **R3 dashboard-metrics** (`monthly[].income_kd/expense_kd`, `expense_by_category` leaves),
  **R4 account-overview** (all `_mtd`/`spend`/`income`/`amount_kd`; `pct` is a number),
  R9 safe-to-spend, R10 weekly-digest (money fields; `delta_pct` is a number),
  R11 income-pattern, R12 recurring-patterns (`avg_amount_kd`), R13 snapshot,
  budget-alert emails (`budget_kd`/`spent_kd`; `ratio`/`threshold` are numbers),
  auth profile (`monthly_income_kd`), GDPR data-export.
- **Number money (`roundedKd`)** — exactly five analytics routes:
  **R1** spend-by-category, **R2** spend-by-month, **R5** expense-breakdown,
  **R6** expense-merchant-trend, **R7** budget-metrics.
- **Number by design (percentages/ratios, not KWD amounts):** R4 `pct`, R10 `delta_pct`,
  budget-alert `ratio`/`threshold`.

The CLAUDE.md edits above are **owed on the next fast-forward** per the memory pointer
`frontend-error-tracking-owed-docs` convention (DOCS-2 batched with any DOCS-1 edits); this Phase-A
document is their persisted source. They are ground-truth corrections and do not depend on sweep
approval.

## Operator rulings folded in (Q1–Q4, 2026-08-01)

- **Q1 — S1+S2 = one commit.** The flip-only `tsc` capture (Part 2 above) is the required evidence
  artifact of that combined commit, NOT a committed state (C2 precedent). Confirmed: Part 2 passes, so
  S1 proceeds as designed inside the combined commit.
- **Q2 — S3 durable control stays in this module** as its own commit, scoped narrowly to a wire-shape
  assertion on money fields under TODO(module-9-contract-validation). **Option 4 (ESLint) DEFERRED as a
  named follow-on:** `TODO(money-numeric-op-lint)`.
- **Q3 — third untriaged budgets error OUT of scope.** Not guessed; moved to the operator-side D3.5
  watch as a targeted interaction walk.
- **Q4 — FinancialSnapshotHero render test APPROVED into S2.** Adds a string-fixture render test
  (also the mechanism covering the A3 test-file blind spot for the category chart).

## Revised sequence (post-rulings)

- **S1+S2 (one frontend commit):** flip the three R3 types to `string`; capture flip-only `tsc` as the
  evidence artifact; coerce every surfaced site with `Number(...||0)` (matching `ExpensesPage.tsx:763`);
  fix `369` string-concat; add the string-fixture render test for the category chart + FinancialSnapshotHero
  (Q4); manual `rg` over `apps/web/src/**/*.test.*` for the three field names as a pre-step.
  Verify: `pnpm --filter statera-frontend run test:unit` exit 0 (+ RED→green); `tsc --noEmit` exit 0.
- **S3 (separate commit):** wire-shape assertion under TODO(module-9-contract-validation).
  Verify: `pnpm --filter statera-api exec vitest run src/contract` exit 0; frontend `test:unit` exit 0.
- **DOCS-2 (next FF):** the three CLAUDE.md edits in Part 3b.
- **Deferred, named:** `TODO(money-numeric-op-lint)` (Q2 Option 4); `SpendingIntelligence*` dead-type cleanup.

**STOP — awaiting review-channel approval. No implementation.**
