/**
 * B4-2 — Guard 2 for the money wire-shape contract (Task B / B4).
 *
 * Rulings: "B4-2 Phase A approval — nullability form confirmed, R8 composition
 * check ruled a deliberate asset, 2026-08-08b" (R1–R8). Lineage in
 * docs/modules/phase4-task-b.md.
 *
 * WHAT THIS CLOSES. apps/api's B4-1 capture records, at runtime, the wire type of
 * every money field on R1–R13 into money-wire-shape.json. That artifact proves what
 * the backend EMITS; nothing yet forced the frontend's declared types to agree with
 * it. This file generates one compile-time assertion per money field into the
 * committed money-wire-shape.assert.ts, which the frontend `tsc --noEmit` gate
 * (deploy.yml:83) checks — so a frontend type that disagrees with the captured wire
 * is a build error rather than a runtime crash (9.1, the 2026-07-10 budgets crash,
 * the R3 money-string sweep).
 *
 * THE TRANSITIVE CHAIN: a wire change makes apps/api's Guard 1 demand a regenerated
 * .json -> the map-gap + byte-equality guards here demand a regenerated .assert.ts
 * -> tsc checks it against the frontend types -> a disagreeing type is red.
 *
 * WHY GUARD 2 LIVES IN THE FRONTEND SUITE (B4-2-R5): the guarded artifact is a
 * frontend file, the gate consuming it is the frontend tsc, and the failure message
 * must name a frontend regenerate script. Mirrors 10a, where frontend-calls.json
 * lives in apps/web with its generation guard while apps/api holds a separate
 * consumption test — the same cross-package read, in the opposite direction.
 */

import { describe, it, expect } from "vitest"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const HERE = dirname(fileURLToPath(import.meta.url))
const WIRE_SHAPE = resolve(HERE, "../../../api/src/contract/money-wire-shape.json")
const ASSERT_FILE = resolve(HERE, "money-wire-shape.assert.ts")

type CapturedEntry = { path: string; type: string; money: boolean }
type CapturedShape = Record<string, CapturedEntry[]>

// ── Route -> frontend type map (a COVERAGE claim, admissible under B4-1-R3) ───
// This says what must be LOOKED AT; it never says what a serializer DOES. Every
// `type` in an emitted assertion comes from the capture, never from this table.
//
// `prefix` is the captured path root that corresponds to the frontend type, which
// is NOT always `data`: analyticsApi.spendByCategory/spendByMonth unwrap `data.items`
// before returning, so their frontend type describes the items, not the envelope.
const ROUTE_MAP: Record<string, { prefix: string; type: string }> = {
  R1: { prefix: "data.items", type: "SpendByCategory" },
  R2: { prefix: "data.items[]", type: "SpendByMonth" },
  R3: { prefix: "data", type: "DashboardMetricsResponse" },
  // R3-tier2 is R3's snapshot-replay serving tier: same endpoint, same frontend
  // type. It merges into R3's assertions below rather than emitting its own.
  "R3-tier2": { prefix: "data", type: "DashboardMetricsResponse" },
  R4: { prefix: "data", type: "AccountOverviewResponse" },
  R5: { prefix: "data", type: "ExpenseBreakdownResponse" },
  R6: { prefix: "data", type: "ExpenseMerchantTrendResponse" },
  R7: { prefix: "data", type: "BudgetMetricsResponse" },
  R8: { prefix: "data", type: "DashboardBundleResponse" },
  R9: { prefix: "data", type: "SafeToSpendResponse" },
  R10: { prefix: "data", type: "WeeklyDigestResponse" },
  R11: { prefix: "data", type: "IncomePatternResponse" },
  R12: { prefix: "data", type: "RecurringPatternsResponse" },
  R13: { prefix: "data", type: "SnapshotResponse" },
}

// B4-2-R5: a missing or moved capture must fail LOUDLY. An unreadable file that
// resolved to `{}` would make the map-gap guard report "every mapped route is
// missing" — noisy but survivable — while an empty-but-parseable one could look
// like agreement. Both are rejected here, before any guard runs.
function readWireShape(): CapturedShape {
  let raw: string
  try {
    raw = readFileSync(WIRE_SHAPE, "utf8")
  } catch (err) {
    throw new Error(
      `B4-2 Guard 2 cannot read the captured wire shape at ${WIRE_SHAPE}. ` +
        `apps/api's money-wire-shape.json is the input to this guard; if it moved, ` +
        `fix the path here rather than letting the guard pass on an empty read. ` +
        `Cause: ${String(err)}`,
    )
  }
  const parsed = JSON.parse(raw) as CapturedShape
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    throw new Error(`B4-2 Guard 2 read an empty or non-object wire shape from ${WIRE_SHAPE}.`)
  }
  return parsed
}

// Captured path -> TypeScript indexed-access expression.
//
// NULLABILITY (B4-2-R1/R2). Every step is wrapped in NonNullable<> and the leaf is
// compared after Exclude<…, null | undefined>, because the capture's `"string"` is
// NOT a complete claim about the wire type: B4-1's NULL fail-loud guard forbids it
// from recording a null money field at all, and MP-2/MP-9 record the non-null arms
// as GAP-RECORDED precisely because the fixtures take them. A strict bidirectional
// equality would therefore assert something the capture never claimed — it fails on
// four correctly-typed `string | null` fields. Stepping with NonNullable<> also
// handles optional intermediates such as `profile_context?`.
function typeExpr(base: string, rest: string): string {
  let out = base
  for (const token of rest.split(".").filter(Boolean)) {
    if (token === "*") {
      out = `NonNullable<${out}>[string]`
      continue
    }
    const m = token.match(/^(.+?)(\[\])?$/)
    if (!m) throw new Error(`unparseable path token: ${token}`)
    out = `NonNullable<${out}>[${JSON.stringify(m[1])}]`
    if (m[2]) out = `NonNullable<${out}>[number]`
  }
  return out
}

type Assertion = { expr: string; type: string; sources: string[] }

// Keyed on the emitted type EXPRESSION, so duplication is impossible by
// construction rather than by a dedup step someone can forget (B4-2-R3). A repeat
// key with the same type appends its source route; a repeat key with a DIFFERENT
// type throws.
function buildAssertions(shape: CapturedShape): Assertion[] {
  const byExpr = new Map<string, Assertion>()
  for (const [route, entries] of Object.entries(shape)) {
    const mapped = ROUTE_MAP[route]
    if (!mapped) continue // reported by the map-gap guard, not silently tolerated
    for (const entry of entries) {
      if (!entry.money) continue
      if (!entry.path.startsWith(mapped.prefix)) {
        throw new Error(
          `B4-2: captured path "${entry.path}" on ${route} does not start with the ` +
            `mapped prefix "${mapped.prefix}". The route map is stale.`,
        )
      }
      const expr = typeExpr(mapped.type, entry.path.slice(mapped.prefix.length))
      const prev = byExpr.get(expr)
      if (prev) {
        if (prev.type !== entry.type) {
          throw new Error(
            `B4-2: two routes disagree on the wire type of ${expr} — ` +
              `${prev.sources.join("/")} say "${prev.type}", ${route} says "${entry.type}". ` +
              `This is a real backend inconsistency, not a generator bug.`,
          )
        }
        prev.sources.push(route)
        continue
      }
      byExpr.set(expr, { expr, type: entry.type, sources: [route] })
    }
  }
  return [...byExpr.values()]
}

function buildAssertSource(shape: CapturedShape): string {
  const assertions = buildAssertions(shape)
  const types = [...new Set(Object.values(ROUTE_MAP).map((m) => m.type))].sort()
  const body = assertions
    .map((a, i) => `// ${a.sources.join(", ")}\nconst _a${i}: AssertEqual<Exclude<${a.expr}, null | undefined>, ${a.type}> = true`)
    .join("\n")
  return `/* eslint-disable @typescript-eslint/no-unused-vars */
// GENERATED by \`pnpm --filter statera-frontend run money-shape:generate\` — DO NOT EDIT.
//
// One compile-time assertion per money/decimal field captured at runtime by
// apps/api/src/contract/money-wire-shape.json (B4-1, Option Y: every wire type is
// \`typeof\` on a real serializer's output, never transcribed). The frontend
// \`tsc --noEmit\` gate checks this file, so a frontend type that disagrees with the
// captured wire is a build error. Regenerate after any wire change and commit the
// result; Guard 2 in money-wire-shape.assert.test.ts fails if you do not.
//
// WHY THE WIRE TYPES ARE BAKED IN AS LITERALS, AND NOT IMPORTED (B4-2-R6).
// \`resolveJsonModule\` is deliberately absent from apps/web/tsconfig.json, but that
// is not the only reason: TypeScript widens a JSON import's string values to
// \`string\`, NOT to the literal \`"string"\`, so an assertion driven off an imported
// JSON compares \`string\` to \`string\` and passes for every field forever. This was
// proven empirically by a consumed \`@ts-expect-error\`. If you enable
// \`resolveJsonModule\` and "simplify" this generator to import the JSON directly,
// you will silently reintroduce that failure.
//
// WHAT THIS DOES NOT CHECK: NULLABILITY (B4-2-R2). Each leaf is compared after
// \`Exclude<…, null | undefined>\`, so a frontend type that wrongly omits \`| null\`
// still passes. That is not a regression — nullability was never in the capture's
// scope, because B4-1's NULL fail-loud guard forbids recording a null money field.
// REVISIT TRIGGER, WITH ITS COST: extending the capture to record nullability
// requires RELAXING that NULL guard, which is a blocking-clause change under TB-R13
// and therefore its own chartered cycle — not a small improvement to make in passing.
//
// R8's assertions look redundant with R4's and R9's and are NOT (B4-2-R3).
// \`DashboardBundleResponse\` composes \`SafeToSpendResponse\` and
// \`AccountOverviewResponse\` by reference, so e.g.
// \`DashboardBundleResponse["safe_to_spend"]["monthly_income_kd"]\` and
// \`SafeToSpendResponse["monthly_income_kd"]\` are different expressions that resolve
// through the composition. Keeping both is a free check that the bundle really is
// typed by those interfaces rather than by a divergent inline shape. Do not
// "optimise" them away. (R3-tier2 DOES merge into R3 — same endpoint, same type,
// identical captured money paths — and the generator throws if the two tiers ever
// disagree.)

import type {
  ${types.join(",\n  ")},
} from "../types/api"

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : { ERR: "differ" }) : { ERR: "differ" }

${body}
`
}

function mapGaps(shape: CapturedShape): { unmapped: string[]; stale: string[] } {
  const captured = Object.keys(shape)
  return {
    unmapped: captured.filter((r) => !ROUTE_MAP[r]),
    stale: Object.keys(ROUTE_MAP).filter((r) => !captured.includes(r)),
  }
}

describe("B4-2 money wire-shape frontend assertions", () => {
  // B4-2-R4. An unmapped route emits zero assertions, zero failures, and vanishes —
  // the CF8/C1 shape one layer out. Both directions are checked.
  it("the route map covers every captured route, and every mapped route is captured", () => {
    const { unmapped, stale } = mapGaps(readWireShape())
    console.log(`\n=== MAP-GAP GUARD === unmapped=${JSON.stringify(unmapped)} stale=${JSON.stringify(stale)}`)
    expect(
      { unmapped, stale },
      unmapped.length
        ? `Captured route(s) with no entry in ROUTE_MAP — their money fields would be ` +
            `silently unasserted: ${unmapped.join(", ")}`
        : `ROUTE_MAP names route(s) absent from money-wire-shape.json: ${stale.join(", ")}`,
    ).toEqual({ unmapped: [], stale: [] })
  })

  it("money-wire-shape.assert.ts matches the committed capture", () => {
    const generated = buildAssertSource(readWireShape())

    if (process.env.MONEY_ASSERT_WRITE === "1") {
      // Mirrors B4-1's CF9: an ambient MONEY_ASSERT_WRITE=1 would make this compare
      // the file to itself and pass forever, and the run would look green. Announce
      // the vacuous-pass state loudly and unconditionally so it cannot be silent.
      console.log(
        "\n*** REGENERATING money-wire-shape.assert.ts — THIS RUN CANNOT FAIL GUARD 2 ***\n" +
          "*** (MONEY_ASSERT_WRITE=1 is set. CI never sets it; see deploy.yml:83 and :92.) ***\n",
      )
      writeFileSync(ASSERT_FILE, generated, "utf8")
      return
    }

    let committed = ""
    try {
      committed = readFileSync(ASSERT_FILE, "utf8")
    } catch {
      // Missing/unreadable → falls through to the mismatch assertion.
    }
    expect(
      generated,
      "money-wire-shape.assert.ts is stale: it no longer matches the wire shape " +
        "captured in apps/api/src/contract/money-wire-shape.json. Regenerate with " +
        "`pnpm --filter statera-frontend run money-shape:generate`, review the diff, " +
        "and commit the result.",
    ).toBe(committed)
  })
})
