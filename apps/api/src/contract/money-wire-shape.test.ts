/**
 * B4-1 — money/decimal WIRE-SHAPE capture for R1–R13 (Task B / B4, Option Y).
 *
 * WHAT THIS IS. Every money/decimal field on the analytics routes is invoked at
 * runtime through `app.request` against a mock db, and its wire type (JSON string
 * vs JSON number) is OBSERVED, never transcribed. The observed shape is committed
 * to `money-wire-shape.json`, which B4-2 turns into frontend compile-time
 * assertions. The defect class this kills: a frontend type annotation that is a
 * claim nobody checked against the wire (9.1 income_source, the 2026-07-10
 * budgets crash, the R3 money-string sweep).
 *
 * ── THE AUTHORING BOUNDARY (B4-1 Phase A ruling, 2026-08-06, B4-1-R3) ─────────
 * Keep this line visible; it is what stops Option Y eroding one convenience at a
 * time.
 *   - Authoring a WIRE TYPE (string vs number) is the FORBIDDEN authored entry.
 *     That is the human transcription Option Y exists to eliminate. Every `type`
 *     in the emitted JSON comes from `typeof` on a real serializer's output.
 *   - Authoring a PATH-PRESENCE or COVERAGE claim is ADMISSIBLE. The emit-site
 *     baselines, the dynamic-key path list, the provenance exception list and the
 *     empty-container exception list are all of this kind: they assert what must
 *     be LOOKED AT. They never assert what the serializer DOES.
 *
 * ── COMPLETENESS: WHAT IS AND IS NOT STRUCTURAL (CF1) ────────────────────────
 * Capturing every leaf (not only money ones) makes the field set complete GIVEN
 * non-empty containers and branch coverage. Those are FIXTURE properties, not
 * structural ones. "Complete by construction" would be overstated: a money field
 * can fail to be captured in two ways —
 *   (i)  it materialises as null            -> caught by the NULL guard;
 *   (ii) it never materialises at all (empty array, empty map, or an unvisited
 *        value-dependent branch) -> zero leaves to walk, zero violations, and the
 *        path silently vanishes from the JSON.
 * Case (ii) is the FIND-S5(a) failure: the frontend suite could not merely have
 * missed the R3 crash, it was INCAPABLE of reaching it, because
 * `expense_by_category` was always `{}`. The PRESENCE guard below exists so this
 * mechanism cannot reproduce that structure inside the module built to prevent it.
 * Guard 1 (`toEqual` the committed JSON) does not cover case (ii): it proves the
 * JSON has not drifted, never that it was right when first committed.
 *
 * ── SHARED KEY-SETS CHANGE BRANCHES, NOT JUST VALUES (CF4) ───────────────────
 * The fixture db dispatches on the `select({...})` key-set, so distinct queries
 * with the same key-set receive the same row. That is harmless for VALUE (we
 * record wire type, not semantics) but NOT for BRANCH: a shared row can send a
 * route down an arm that emits fewer leaves — case (ii) arriving by another door.
 * Where a shared key-set could change arm selection:
 *   - `select{total}` (R4 x3, R5, R9 x2, R10, budgets income): feeds
 *     `resolveIncomeForPeriod`. A ZERO row takes the "fall through to profile"
 *     arm and can end at `amountKd: null`, nulling R9/R11/R8 `monthly_income_kd`
 *     and `budget_to_income_pct`. The fixture is NON-ZERO so the detected arm is
 *     taken. This is the N1/N2/N4 nullable requirement.
 *   - `select{amount,catName}` (R9 budget rows): a zero/empty result makes
 *     `totalBudget` 0, which flips `data_complete` and adds a `budgets_not_set`
 *     warning. Non-zero fixture takes the funded arm.
 *   - `select{txDate,incomeName,amountKd}` (R11): fewer than 2 distinct months
 *     short-circuits to `detected:false` at intelligence-lib.ts:387, where
 *     `suggested_monthly_income_kd` is hardcoded null. 3 months are supplied so
 *     the `detected:true` arm at :505 is reached (N3).
 *   - `select{txDate,displayName,...}` (R12): a group with <2 entries is skipped
 *     entirely, emitting zero patterns. 3 entries are supplied.
 *   - `select{ym,catName,total,isIncome}` (R3): rows whose month is outside the
 *     requested window are dropped (`if (!(monthKey in incomeByMonth)) continue`),
 *     so the fixture months must match the window, and BOTH months carry an
 *     expense row so neither `expense_by_category` bucket is empty (C2).
 *   - `select{id,eventName,propertiesJson,eventTs}` (R8 alerts): a row whose
 *     `month` differs from the request month, or a dismissal, is skipped and the
 *     items array empties.
 *
 * ── WHAT IS MOCKED, AND WHY THAT IS NOT AN AUTHORED ENTRY ────────────────────
 * ONLY `../db/connection` (getDb) and `../lib/rate-limit`. Mocking a data SOURCE
 * is a fixture; mocking a SERIALIZER is an authored entry by the back door.
 * Deliberately NOT mocked, all of which run for real here: `withAnalyticsTimeout`,
 * `cacheGet`/`cacheSet`, `getDashboardMetricsWithCache`, `resolveIncomeForPeriod`,
 * `buildBudgetPayload`, `listActiveBudgetAlerts`. (`routes/aggregation.test.ts`
 * mocks `./budgets`; if this file did the same, R8's four budget money types
 * would be transcriptions rather than observations.)
 *
 * ── GATE ─────────────────────────────────────────────────────────────────────
 * This file is gated by the full hermetic suite (`pnpm --filter statera-api test`,
 * .github/workflows/deploy.yml:91). There is NO standalone `vitest run src/contract`
 * CI step — 10f removed it as subsumed by the full suite, so any claim that one
 * exists is stale (the CLAUDE.md 10a entry still describes it).
 *
 * Regenerate: `pnpm --filter statera-api run money-shape:capture`
 *
 * NOTE on R3's cache tier: `months=2` never equals DASHBOARD_SNAPSHOT_MONTHS (24),
 * so `isSnapshotEligible` is false and the capture always takes Tier 3 (on-demand
 * recompute). That is deliberate — Tier 3 is where `computeDashboardMetricsPayload`
 * runs `formatKd`. Tier 2 replays an already-serialized snapshot and would observe
 * the shape of stored JSON rather than the shape a serializer produces.
 */

import { describe, it, expect, vi } from "vitest"
import { Hono } from "hono"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { aggregationRouter } from "../routes/aggregation"
import { intelligenceRouter } from "../routes/intelligence"
import { createSessionToken } from "../middleware/auth"

vi.mock("../db/connection", () => ({ getDb: vi.fn() }))
import { getDb } from "../db/connection"

vi.mock("../lib/rate-limit", () => ({
  searchRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  importRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  exportRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  readRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  writeRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
  heavyWriteRateLimit: (_c: unknown, next: () => Promise<void>) => next(),
}))

// ── Serializer provenance ────────────────────────────────────────────────────
// Wrap the REAL formatKd/roundedKd and record every value they return, so the
// money predicate can be AUDITED against what the serializers actually produced
// rather than merely trusted. `formatKd` is DEFINED in lib/kd.ts and re-exported
// by lib/transaction-lib.ts; consumers import from BOTH paths, so the definition
// site is wrapped — wrapping the re-export silently misses lib/budget-alerts-lib.ts.
const EMITTED = new Set<string>()

vi.mock("../lib/kd", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>
  const real = mod.formatKd as (v: unknown) => string
  return {
    ...mod,
    formatKd: (v: unknown) => {
      const out = real(v)
      EMITTED.add(`string:${out}`)
      return out
    },
  }
})

vi.mock("../lib/analytics-helpers", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>
  const real = mod.roundedKd as (v: unknown) => number
  return {
    ...mod,
    roundedKd: (v: unknown) => {
      const out = real(v)
      EMITTED.add(`number:${out}`)
      return out
    },
  }
})

// ── Fixture db (shape dispatch on the select() key-set) ──────────────────────
// Order-independent, so R8's sequential-then-Promise.all fan-out needs no
// positional assumptions. Every money-bearing query returns a NON-ZERO row; see
// the CF4 branch notes in the header for why zero rows would be unsafe.
const FIXTURES: Record<string, unknown[]> = {
  "category,total": [{ category: "Groceries", total: "120.500" }],
  "month,total": [{ month: "2026-05", total: "310.250" }],
  total: [{ total: "1500.750" }],
  count: [{ count: 7 }],
  "name,total": [{ name: "Lulu", total: "88.125" }],
  "ym,total": [{ ym: "2026-05", total: "44.500" }],
  "catName,total": [{ catName: "Groceries", total: "60.375" }],
  "catName,ym,total": [{ catName: "Groceries", ym: "2026-05", total: "24.000" }],
  // R3 (C2): BOTH window months carry an expense row so neither
  // expense_by_category bucket is empty, and the map-key normalisation is
  // exercised on multi-key data rather than a degenerate single key.
  "ym,catName,total,isIncome": [
    { ym: "2026-04", catName: "Salary", total: "1950.000", isIncome: 1 },
    { ym: "2026-04", catName: "Groceries", total: "160.125", isIncome: 0 },
    { ym: "2026-04", catName: "Transport", total: "40.500", isIncome: 0 },
    { ym: "2026-05", catName: "Salary", total: "2000.000", isIncome: 1 },
    { ym: "2026-05", catName: "Groceries", total: "175.250", isIncome: 0 },
  ],
  "ym,incomeTotal,spendTotal": [{ ym: "2026-05", incomeTotal: "2000.000", spendTotal: "175.250" }],
  monthlyIncomeKd: [{ monthlyIncomeKd: "1800.000" }],
  "monthlyIncomeKd,paydayDay": [{ monthlyIncomeKd: "1800.000", paydayDay: 25 }],
  paydayDay: [{ paydayDay: 25 }],
  "amount,catName": [{ amount: "300.000", catName: "Groceries" }],
  "id,month,amountKd,categoryName": [
    { id: 1, month: "2026-05", amountKd: "300.000", categoryName: "Groceries" },
  ],
  id: [{ id: 1 }],
  computedAt: [{ computedAt: new Date("2026-05-31T12:00:00.000Z") }],
  "income,expense": [{ income: "2000.000", expense: "175.250" }],
  // R11 (N3): >=2 distinct months on a regular day-25 cadence -> detected:true,
  // which is the only arm where suggested_monthly_income_kd is non-null.
  "txDate,incomeName,amountKd": [
    { txDate: "2026-03-25", incomeName: "Salary", amountKd: "1900.000" },
    { txDate: "2026-04-25", incomeName: "Salary", amountKd: "1900.000" },
    { txDate: "2026-05-25", incomeName: "Salary", amountKd: "1900.000" },
  ],
  // R12: >=2 entries in one normalised group, or zero patterns are emitted.
  "txDate,displayName,amountKd,categoryName,merchantName": [
    { txDate: "2026-05-01", displayName: "Netflix", amountKd: "5.500", categoryName: "Entertainment", merchantName: "Netflix" },
    { txDate: "2026-06-01", displayName: "Netflix", amountKd: "5.500", categoryName: "Entertainment", merchantName: "Netflix" },
    { txDate: "2026-07-01", displayName: "Netflix", amountKd: "5.500", categoryName: "Entertainment", merchantName: "Netflix" },
  ],
  // R8 budget alerts: product_events rows; `month` must match the request month.
  "id,eventName,propertiesJson,eventTs": [
    {
      id: 9,
      eventName: "budget_alert",
      propertiesJson: JSON.stringify({
        alert_key: "groceries|2026-05",
        month: "2026-05",
        category: "Groceries",
        category_id: 3,
        budget_kd: "300.000",
        spent_kd: "280.125",
        ratio: 0.93,
        threshold: 0.9,
      }),
      eventTs: new Date("2026-05-20T10:00:00.000Z"),
    },
  ],
}

type DbCall = { kind: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFixtureDb(log: DbCall[]): any {
  let pending: string | null = null
  let kind = "unknown"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function proxy(): any {
    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const rows = pending !== null ? (FIXTURES[pending] ?? []) : []
            log.push({ kind })
            pending = null
            kind = "unknown"
            return (resolve_: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(rows).then(resolve_, reject)
          }
          return (...args: unknown[]) => {
            if (prop === "select" || prop === "selectDistinct") {
              if (args[0] && typeof args[0] === "object") {
                pending = Object.keys(args[0] as object).join(",")
                kind = `select{${pending}}`
              } else {
                kind = "select()" // bare select — no projection object
              }
            } else if (prop === "insert" || prop === "update" || prop === "delete" || prop === "execute") {
              // C4: named explicitly so no db call in the transcript is an
              // unidentified glyph. These are writes/DDL-ish statements whose
              // resolved value no serializer reads.
              kind = prop
            }
            return proxy()
          }
        },
      },
    )
  }
  return proxy()
}

// ── Path normalisation (COVERAGE claim — admissible per B4-1-R3) ─────────────
// Containers whose KEYS are data (category names, month keys) rather than schema.
// Their keys normalise to `*` so the committed artifact encodes no fixture-
// specific category or month name. Fixed-key containers (e.g. R13 cash_flow's
// 30d/60d/90d) are NOT listed and keep their keys.
const DYNAMIC_KEY_PATHS: Record<string, RegExp[]> = {
  R1: [/^data\.items$/],
  R3: [/^data\.expense_by_category$/, /^data\.expense_by_category\.\*$/],
  R7: [/^data\.spent_by_category$/, /^data\.range_spent_by_category$/, /^data\.avg12_by_category$/],
}

// ── Money classification (predicate; AUDITED against provenance below) ───────
const MONEY_KEY_SUFFIX = /_kd$/
const MONEY_KEYS = new Set([
  "spend",
  "income",
  "total_spend_mtd",
  "total_income_mtd",
  "spend_mtd",
  // B4-1-R2 (ruling 2026-08-06): a .toFixed(1) decimal string with a null branch,
  // and the field behind the 2026-07-10 budgets crash. In scope.
  "budget_to_income_pct",
])
const MONEY_VALUE_MAPS = [
  /^data\.items$/, // R1 (map form; R2's data.items is an array)
  /^data\.spent_by_category$/,
  /^data\.range_spent_by_category$/,
  /^data\.avg12_by_category$/,
  /^data\.expense_by_category\.\*$/,
  /committed_breakdown_kd$/, // R9 and R8.safe_to_spend
]

// ── Empty-container exceptions (COVERAGE claim — admissible per B4-1-R3) ─────
// C1 requires every empty array/object to throw unless NAMED here with a
// file:line justification for why it is empty BY DESIGN rather than by fixture
// poverty. Keep short and reviewable.
const EMPTY_ALLOWED: Array<{ path: RegExp; why: string }> = [
  {
    path: /^data\.accounts$/,
    why: "R13 intelligence-lib.ts:611 `accounts: []` — hardcoded empty; bank sync deferred indefinitely. No money leaves exist beneath it in any state.",
  },
  {
    path: /connected_accounts$/,
    why: "R4/R8 aggregation.ts:870 `connected_accounts: []` — hardcoded empty; bank sync deferred indefinitely. No money leaves exist beneath it in any state.",
  },
  {
    path: /warnings$/,
    why: "R9/R8 aggregation.ts:699-702 — empty IS the healthy state (income resolved AND budgets funded). Non-empty is mutually exclusive with the N1 non-null `monthly_income_kd` requirement, so it cannot be forced without defeating a blocking condition. Contains only strings, never money.",
  },
]

type Leaf = {
  path: string
  /** Pre-normalisation path, retaining real map keys and array indices. Kept so the
   *  close-out can show that map-key normalisation ran on genuinely multi-key data
   *  rather than a single-key degenerate case (C2). */
  rawPath: string
  type: string
  money: boolean
  sample: unknown
  fromSerializer: boolean
}

function normalizeKey(parentPath: string, key: string, route: string): string {
  const dyn = DYNAMIC_KEY_PATHS[route] ?? []
  return dyn.some((re) => re.test(parentPath)) ? "*" : key
}

/**
 * Walks a payload recording every leaf's OBSERVED wire type, and collects both
 * fail-loud classes:
 *   - PRESENCE (C1 case ii): an empty array or empty object, unless EMPTY_ALLOWED.
 *   - NULL     (C1 case i):  a money leaf that is not a string or a number.
 *
 * DEVIATION from the C1 wording ("any EMPTY array or EMPTY object throws"),
 * flagged rather than assumed: violations are COLLECTED and then fail the run via
 * the caller's assertion, instead of throwing on the first one. Same fail-loud
 * effect — a violation cannot produce a green run — but the operator sees every
 * violation in one run instead of one per re-run. The observer checks below
 * inspect the collected arrays directly, which is why they can assert that a
 * non-empty sibling is not false-positived.
 */
function walk(
  node: unknown,
  path: string,
  route: string,
  out: Leaf[],
  parentIsMoneyMap: boolean,
  presenceErrors: string[],
  nullErrors: string[],
  rawPath: string = path,
) {
  if (Array.isArray(node)) {
    if (node.length === 0) {
      if (!EMPTY_ALLOWED.some((e) => e.path.test(path))) {
        presenceErrors.push(
          `EMPTY CONTAINER (array): ${route} ${path} — an empty container cannot prove the ` +
            `absence of money leaves beneath it, so the path silently vanishes from the ` +
            `committed shape and B4-2 generates no assertion for it. Populate the fixture, ` +
            `or add a file:line-justified entry to EMPTY_ALLOWED.`,
        )
      }
      return
    }
    node.forEach((el, i) =>
      walk(el, `${path}[]`, route, out, false, presenceErrors, nullErrors, `${rawPath}[${i}]`),
    )
    return
  }

  if (node !== null && typeof node === "object") {
    const entries = Object.entries(node as Record<string, unknown>)
    if (entries.length === 0) {
      if (!EMPTY_ALLOWED.some((e) => e.path.test(path))) {
        presenceErrors.push(
          `EMPTY CONTAINER (object): ${route} ${path} — an empty container cannot prove the ` +
            `absence of money leaves beneath it, so the path silently vanishes from the ` +
            `committed shape and B4-2 generates no assertion for it. Populate the fixture, ` +
            `or add a file:line-justified entry to EMPTY_ALLOWED.`,
        )
      }
      return
    }
    const isMoneyMap = MONEY_VALUE_MAPS.some((re) => re.test(path))
    for (const [k, v] of entries) {
      walk(
        v,
        `${path}.${normalizeKey(path, k, route)}`,
        route,
        out,
        isMoneyMap,
        presenceErrors,
        nullErrors,
        `${rawPath}.${k}`,
      )
    }
    return
  }

  const key = path.split(".").pop()!.replace(/\[\]$/, "")
  const type = node === null ? "null" : typeof node
  const money = parentIsMoneyMap || MONEY_KEY_SUFFIX.test(key) || MONEY_KEYS.has(key)
  if (money && type !== "string" && type !== "number") {
    nullErrors.push(
      `MONEY FIELD NOT CAPTURABLE: ${route} ${path} -> runtime value ${JSON.stringify(node)} ` +
        `(typeof "${type}"). A money field must be non-null at capture time, or the generated ` +
        `assertion silently narrows or vanishes. Populate the fixture for this field.`,
    )
  }
  const fromSerializer =
    (type === "string" && EMITTED.has(`string:${String(node)}`)) ||
    (type === "number" && EMITTED.has(`number:${String(node)}`))
  out.push({ path, rawPath, type, money, sample: node, fromSerializer })
}

// ── Routes ───────────────────────────────────────────────────────────────────
const app = new Hono()
  .route("/api/analytics", aggregationRouter)
  .route("/api/analytics", intelligenceRouter)

const ROUTES: Array<{ id: string; path: string }> = [
  { id: "R1", path: "/api/analytics/spend-by-category" },
  { id: "R2", path: "/api/analytics/spend-by-month" },
  { id: "R3", path: "/api/analytics/dashboard-metrics?months=2&until=2026-05" },
  { id: "R4", path: "/api/analytics/account-overview?month=2026-05" },
  { id: "R5", path: "/api/analytics/expense-breakdown?dimension=category&range=month&month=2026-05" },
  { id: "R6", path: "/api/analytics/expense-merchant-trend?merchant=Lulu&months=3&until=2026-05" },
  { id: "R7", path: "/api/analytics/budget-metrics?month=2026-05&range=month" },
  { id: "R8", path: "/api/analytics/dashboard-bundle?month=2026-05" },
  { id: "R9", path: "/api/analytics/safe-to-spend?month=2026-05" },
  { id: "R10", path: "/api/analytics/weekly-digest" },
  { id: "R11", path: "/api/analytics/income-pattern" },
  { id: "R12", path: "/api/analytics/recurring-patterns?days=90" },
  { id: "R13", path: "/api/analytics/snapshot" },
]

type CapturedEntry = { path: string; type: string; money: boolean }
type CapturedShape = Record<string, CapturedEntry[]>

const ARTIFACT = resolve(__dirname, "money-wire-shape.json")

async function captureAll(): Promise<{
  shape: CapturedShape
  leaves: Record<string, Leaf[]>
  presenceErrors: string[]
  nullErrors: string[]
  statuses: Record<string, number>
  dbCalls: Record<string, DbCall[]>
}> {
  const token = await createSessionToken({
    userId: 1,
    externalId: "money-wire-shape",
    authProvider: "test",
    sv: 1,
  })
  const headers = { Authorization: `Bearer ${token}` }

  const shape: CapturedShape = {}
  const leaves: Record<string, Leaf[]> = {}
  const presenceErrors: string[] = []
  const nullErrors: string[] = []
  const statuses: Record<string, number> = {}
  const dbCalls: Record<string, DbCall[]> = {}

  for (const route of ROUTES) {
    const log: DbCall[] = []
    vi.mocked(getDb).mockReturnValue(makeFixtureDb(log))
    const res = await app.request(route.path, { headers })
    statuses[route.id] = res.status
    dbCalls[route.id] = log
    if (res.status !== 200) continue
    const body = (await res.json()) as Record<string, unknown>
    const routeLeaves: Leaf[] = []
    walk(body.data, "data", route.id, routeLeaves, false, presenceErrors, nullErrors)
    leaves[route.id] = routeLeaves

    // Deduplicate by normalised path (array elements and map keys collapse), and
    // assert the wire type is uniform across every occurrence — a route emitting
    // string in one element and number in another would be a real finding.
    const byPath = new Map<string, CapturedEntry>()
    for (const leaf of routeLeaves) {
      const prev = byPath.get(leaf.path)
      if (prev && prev.type !== leaf.type) {
        throw new Error(
          `NON-UNIFORM WIRE TYPE: ${route.id} ${leaf.path} observed as both ` +
            `"${prev.type}" and "${leaf.type}" within one response.`,
        )
      }
      if (!prev) byPath.set(leaf.path, { path: leaf.path, type: leaf.type, money: leaf.money })
    }
    shape[route.id] = [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  }

  return { shape, leaves, presenceErrors, nullErrors, statuses, dbCalls }
}

// ── Emit-site guard (B4-1-R1: per-file CALL-SITE table) ──────────────────────
// Primitive sites are greppable formatKd(/roundedKd( call sites. Non-primitive
// sites (.toFixed / String() / literal zero-fill) cannot be re-derived by any
// single grep, so they are pinned as an explicit file:line inventory instead of
// a count — the same treatment as the provenance exception list.
//
// Under Option Y this guard has a second job: a primitive call site with no
// captured entry means a route the capture does not invoke.
const REPO_SRC = resolve(__dirname, "..")

const PRIMITIVE_BASELINES: Array<{ file: string; sites: number; feeds: string }> = [
  { file: "routes/aggregation.ts", sites: 28, feeds: "R1 R2 R4 R5 R6 R7 R9 R10" },
  { file: "lib/intelligence-lib.ts", sites: 9, feeds: "R11 R12 R13" },
  { file: "lib/dashboard-snapshot-lib.ts", sites: 3, feeds: "R3" },
  { file: "routes/budgets.ts", sites: 2, feeds: "R8 (:64 wire; :306 write-path, see NON_WIRE_PRIMITIVE)" },
  { file: "lib/budget-alerts-lib.ts", sites: 1, feeds: "R8" },
]

// Primitive call sites that exist but never reach a wire response, so they can
// never have a captured entry. Named so the guard's second job is not diluted
// the way the retired "33 sites" baseline diluted it (5 of its 33 units were
// comments and imports).
const NON_WIRE_PRIMITIVE: Array<{ site: string; why: string }> = [
  {
    site: "routes/budgets.ts:306",
    why: "formatKd() formatting an INSERT value inside POST /api/budgets (toInsert.push), not a response field.",
  },
]

// Money emitted without any serializer primitive. No grep can re-derive these;
// pinned explicitly (F3, accepted as load-bearing by the 2026-08-06 ruling).
const NON_PRIMITIVE_SITES: Array<{ site: string; field: string }> = [
  { site: "routes/aggregation.ts:341", field: "R6 series[].total_kd — zero-fill literal `byMonth[mk] ?? 0`" },
  { site: "routes/aggregation.ts:1047", field: "R10 safe_to_spend_today_kd — `String(...)` pass-through of R9 daily_rate_kd" },
  { site: "routes/budgets.ts:147", field: "R8 budget.profile_context.budget_to_income_pct — `.toFixed(1)`" },
  { site: "routes/budgets.ts:151", field: "R8 budget.profile_context.budget_total_kd — `.toFixed(3)`" },
  { site: "routes/budgets.ts:152", field: "R8 budget.profile_context.monthly_income_kd — `.toFixed(3)`" },
]

function countPrimitiveSites(relFile: string): number {
  const text = readFileSync(resolve(REPO_SRC, relFile), "utf8")
  return text
    .split("\n")
    .filter((line) => /(formatKd|roundedKd)\(/.test(line))
    .filter((line) => !/^\s*(\*|\/\/)/.test(line)) // drop comment lines
    .length
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("B4-1 money wire-shape capture", () => {
  it("invokes R1-R13, captures money wire types, and violates neither guard", async () => {
    const { shape, leaves, presenceErrors, nullErrors, statuses, dbCalls } = await captureAll()

    for (const route of ROUTES) {
      expect(statuses[route.id], `${route.id} must be hermetically invocable`).toBe(200)
    }

    for (const route of ROUTES) {
      const money = (leaves[route.id] ?? []).filter((l) => l.money)
      const kinds = dbCalls[route.id].map((c) => c.kind).join(" | ")
      console.log(`\n### ${route.id} status=${statuses[route.id]} dbcalls=${dbCalls[route.id].length} :: ${kinds}`)
      const seen = new Set<string>()
      for (const l of money) {
        if (seen.has(l.path)) continue
        seen.add(l.path)
        console.log(`    ${l.type.padEnd(6)} ${l.path} = ${JSON.stringify(l.sample)}`)
      }
    }
    // C2 (2026-08-06 ruling): R3 is the production-crash route, the money-string
    // sweep's subject, and B4-2's RED-gate subject. Show its money leaves BEFORE
    // normalisation so multi-key coverage is visible rather than collapsed.
    console.log("\n=== C2 — R3 money leaves, PRE-NORMALISATION (raw map keys / array indices) ===")
    for (const l of (leaves.R3 ?? []).filter((x) => x.money)) {
      console.log(`    ${l.type.padEnd(6)} ${l.rawPath} = ${JSON.stringify(l.sample)}   -> normalised ${l.path}`)
    }
    const r3Months = new Set(
      (leaves.R3 ?? []).filter((l) => l.money && l.rawPath.startsWith("data.expense_by_category."))
        .map((l) => l.rawPath.split(".")[2]),
    )
    const r3Cats = new Set(
      (leaves.R3 ?? []).filter((l) => l.money && l.rawPath.startsWith("data.expense_by_category."))
        .map((l) => l.rawPath.split(".")[3]),
    )
    console.log(`    expense_by_category month keys: ${[...r3Months].join(", ")}  (${r3Months.size})`)
    console.log(`    expense_by_category category leaves: ${[...r3Cats].join(", ")}  (${r3Cats.size})`)

    const totalMoney = Object.values(shape).reduce((n, r) => n + r.filter((e) => e.money).length, 0)
    const totalLeaves = Object.values(shape).reduce((n, r) => n + r.length, 0)
    console.log(`\n=== ROUTES CAPTURED: ${Object.keys(shape).length} ===`)
    console.log(`=== TOTAL LEAVES: ${totalLeaves} ===`)
    console.log(`=== TOTAL MONEY PATHS: ${totalMoney} ===`)
    console.log(`=== PRESENCE VIOLATIONS: ${presenceErrors.length} ===\n${presenceErrors.join("\n")}`)
    console.log(`=== FAIL-LOUD VIOLATIONS: ${nullErrors.length} ===\n${nullErrors.join("\n")}`)

    expect(presenceErrors).toEqual([])
    expect(nullErrors).toEqual([])

    // C2: all three R3 money paths present, on genuinely multi-key data.
    const r3 = shape.R3.filter((e) => e.money).map((e) => e.path)
    expect(r3).toEqual([
      "data.expense_by_category.*.*",
      "data.monthly[].expense_kd",
      "data.monthly[].income_kd",
    ])
    expect(r3Months.size, "R3 needs >=2 expense_by_category month keys").toBeGreaterThanOrEqual(2)
    expect(r3Cats.size, "R3 needs >=1 expense_by_category category leaf").toBeGreaterThanOrEqual(1)
  })

  it("Guard 1: the re-derived shape equals the committed money-wire-shape.json", async () => {
    const { shape } = await captureAll()
    if (process.env.MONEY_SHAPE_WRITE === "1") {
      writeFileSync(ARTIFACT, `${JSON.stringify(shape, null, 2)}\n`, "utf8")
    }
    const committed = JSON.parse(readFileSync(ARTIFACT, "utf8")) as CapturedShape
    expect(shape).toEqual(committed)
  })

  it("OBSERVER CHECK: the PRESENCE guard fires on an emptied container", () => {
    const presenceErrors: string[] = []
    const nullErrors: string[] = []
    const out: Leaf[] = []
    walk(
      { monthly: [{ income_kd: "1.000" }], expense_by_category: {} },
      "data",
      "R3",
      out,
      false,
      presenceErrors,
      nullErrors,
    )
    console.log(`\n=== OBSERVER CHECK (presence): ${presenceErrors.length} violation(s) ===\n${presenceErrors.join("\n")}`)
    expect(presenceErrors).toHaveLength(1)
    expect(presenceErrors[0]).toContain("data.expense_by_category")
    expect(nullErrors).toHaveLength(0) // the non-empty sibling is not false-positived
  })

  it("OBSERVER CHECK: the NULL guard fires on a nulled money field", () => {
    const presenceErrors: string[] = []
    const nullErrors: string[] = []
    const out: Leaf[] = []
    walk(
      { monthly_income_kd: null, total_budget_kd: "1.000" },
      "data",
      "R9",
      out,
      false,
      presenceErrors,
      nullErrors,
    )
    console.log(`\n=== OBSERVER CHECK (null): ${nullErrors.length} violation(s) ===\n${nullErrors.join("\n")}`)
    expect(nullErrors).toHaveLength(1)
    expect(nullErrors[0]).toContain("data.monthly_income_kd")
    expect(presenceErrors).toHaveLength(0)
  })

  it("emit-site guard: per-file primitive call-site counts hold", () => {
    console.log("\n=== EMIT-SITE GUARD (primitive call sites per file) ===")
    let total = 0
    for (const b of PRIMITIVE_BASELINES) {
      const actual = countPrimitiveSites(b.file)
      console.log(`    ${String(actual).padStart(3)}  (baseline ${b.sites})  ${b.file}   feeds: ${b.feeds}`)
      expect(actual, `${b.file} primitive call-site count`).toBe(b.sites)
      total += actual
    }
    console.log(`    ---`)
    console.log(`    ${total}  primitive call sites total`)
    console.log(`    ${NON_WIRE_PRIMITIVE.length}  of which never reach a wire response (named)`)
    console.log(`    ${total - NON_WIRE_PRIMITIVE.length}  wire-emitting primitive sites`)
    console.log(`    ${NON_PRIMITIVE_SITES.length}  non-primitive wire sites (pinned file:line, not greppable)`)
    console.log(`    ${total - NON_WIRE_PRIMITIVE.length + NON_PRIMITIVE_SITES.length}  wire-emitting sites feeding R1-R13`)
    expect(total).toBe(43)
    expect(total - NON_WIRE_PRIMITIVE.length + NON_PRIMITIVE_SITES.length).toBe(47)
  })

  it("provenance audit: every serializer-produced leaf is classified money", async () => {
    const { leaves } = await captureAll()
    const misses: string[] = []
    const extras: string[] = []
    for (const [routeId, routeLeaves] of Object.entries(leaves)) {
      const seen = new Set<string>()
      for (const l of routeLeaves) {
        if (seen.has(l.path)) continue
        seen.add(l.path)
        if (l.fromSerializer && !l.money) {
          misses.push(`  MISS  ${routeId} ${l.path} = ${JSON.stringify(l.sample)}`)
        }
        if (!l.fromSerializer && l.money) {
          extras.push(`  EXTRA ${routeId} ${l.path} = ${JSON.stringify(l.sample)}`)
        }
      }
    }
    console.log(`\n=== PROVENANCE AUDIT ===`)
    console.log(`MISS (serializer-produced, predicate said NOT money): ${misses.length}\n${misses.join("\n")}`)
    console.log(`EXTRA (predicate said money, no serializer provenance): ${extras.length}\n${extras.join("\n")}`)

    // A MISS is always a real predicate gap.
    expect(misses).toEqual([])
    // EXTRAs are permitted only for the pinned non-primitive emitters (F3): the
    // R6 zero-fill literal and the two budgets .toFixed decimal strings. Anything
    // else means the predicate claimed money where no serializer ran.
    for (const e of extras) {
      expect(
        /series\[\]\.total_kd|budget_to_income_pct|budget_total_kd|monthly_income_kd/.test(e),
        `unexpected EXTRA not covered by the pinned non-primitive inventory: ${e}`,
      ).toBe(true)
    }
  })
})
