// MOB-R82 C5–C8 — Plan figures stay on one line and step down a size (C5); the Plan chart legend's words
// are muted ink (C6); MonthDelta's signed amounts (C7); look A page headers (C8).
import { render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import PageHeader from "@/components/layout/PageHeader"
import { kpiAmountClass } from "./budget/sections"
import { formatSignedKD } from "./insights/MonthDeltaCard"

describe("look A rulings (MOB-R82)", () => {
  it("C5: a Plan figure never wraps and steps down a size as it grows, up to six integer digits", () => {
    // Steps measured at 375x667 (a 160px cell): text-xl fits 9 characters, text-lg 14, text-base 16.
    expect(kpiAmountClass("KD 99.000")).toContain("text-xl")
    expect(kpiAmountClass("KD 890.000")).toContain("text-lg")
    expect(kpiAmountClass("KD 999,999.000")).toContain("text-lg")
    expect(kpiAmountClass("−KD 999,999.000")).toContain("text-base")
    for (const t of ["KD 890.000", "KD 999,999.000"]) expect(kpiAmountClass(t)).toContain("whitespace-nowrap")
  })

  it("C6: the Plan chart legend's words are muted ink; the swatch keeps the series colour", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/pages/budget/sections.tsx"), "utf8")
    expect(src).toMatch(/<Legend[^>]*formatter=\{\(value\) => <span className="text-muted-foreground">\{value\}<\/span>\}/)
  })

  it("C7: MonthDelta reads +KD 2.500, −KD 2.500 and KD 0.000", () => {
    expect(formatSignedKD(2.5)).toBe("+KD 2.500")
    expect(formatSignedKD(-2.5)).toBe("−KD 2.500")
    expect(formatSignedKD(0)).toBe("KD 0.000")
  })

  it("C8: a look A header is an eyebrow over an uppercase heading with its last word on the highlight", () => {
    render(<PageHeader variant="lookA" badge="Plan" badgeSuffix="October 2026" title="Plan your monthly budgets" />)
    expect(screen.getByText(/^Plan · October 2026$/)).toHaveClass("uppercase")
    const h1 = screen.getByRole("heading", { level: 1, name: "Plan your monthly budgets" })
    expect(h1).toHaveClass("uppercase")
    expect(screen.getByText("budgets")).toHaveClass("bg-highlight")
  })
})
