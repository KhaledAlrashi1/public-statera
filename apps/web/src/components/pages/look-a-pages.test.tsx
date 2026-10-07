// MOB-R81 C5 — look A on the pages other than /log and Home. Three pins: (1) the class census — no
// card-in-card classes and no colour outside the tokens in the in-scope files; (2) every Plan amount
// goes through formatKD (chart axis ticks excepted); (3) rendered, no card sits inside a card on the
// Insights cards that had one.
import { render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"

import { MonthDeltaCard } from "./insights/MonthDeltaCard"
import { RecurringCommitmentsCard } from "./insights/RecurringCommitmentsCard"

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8")
// The files whose nested cards became plain sections (each renders inside a section-panel).
const NESTED_FILES = [
  "./insights/MonthDeltaCard.tsx",
  "./insights/RecurringCommitmentsCard.tsx",
  "./budget/sections.tsx",
  "./ProfilePage.tsx",
  "./profile/DataPrivacySection.tsx",
  "./transactions/TransactionsTable.tsx",
]

describe("look A on the other pages (MOB-R81 C5)", () => {
  it("class census: no inner-card or surface-row-card, and no white outside the tokens", () => {
    const hits = NESTED_FILES.flatMap((f) =>
      [...read(f).matchAll(/\b(inner-card|surface-row-card|bg-white)\b/g)].map((m) => `${f}: ${m[0]}`),
    )
    expect(hits).toEqual([])
  })

  it("every Plan amount shows KD through formatKD (axis ticks excepted)", () => {
    const offenders = ["./budget/sections.tsx", "./BudgetPage.tsx"].flatMap((f) =>
      read(f)
        .split("\n")
        .filter((l) => /formatCompactKD\(|KD \{fmt3\(/.test(l) && !/tickFormatter/.test(l))
        .map((l) => `${f}: ${l.trim()}`),
    )
    expect(offenders).toEqual([])
  })

  it("rendered, the Insights cards hold plain rows, not cards", () => {
    render(
      <>
        <MonthDeltaCard
          loading={false}
          rows={[{ category: "Groceries", this_month_kd: 71.1, last_month_kd: 60, delta_kd: 11.1, delta_pct: 18.5 }]}
        />
        <RecurringCommitmentsCard
          loading={false}
          onDismiss={vi.fn()}
          onOpenActivity={vi.fn()}
          rows={[{ name: "Home internet", avg_amount_kd: 15, expected_day: 7, next_expected_date: "2026-10-07", status: "Upcoming", group: "Utilities" }]}
        />
      </>,
    )
    expect(screen.getByText("Groceries")).toBeInTheDocument()
    expect(screen.getByText("Home internet")).toBeInTheDocument()
    const cardInCard = document.querySelectorAll(
      ".section-panel .section-panel, .section-panel .inner-card, .section-panel .surface-row-card, .section-panel [class*='rounded'][class*='border'][class*='bg-background']",
    )
    expect(cardInCard).toHaveLength(0)
  })
})
