// MOB-R87 F — the polish batch's unit-level pins: Plan's four tiles share one size (F3), any other month reads
// "December 2025" (F4), and the budget dialog saves the normalizer's exact value, the one its readout shows (F8).
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BudgetDialog, kpiAmountClass, kpiGroupClass } from "./budget/sections"
import { monthPhraseFor } from "@/lib/month-phrase"
import { labelForYM, toYearMonth, today } from "@/lib/utils"

describe("MOB-R87 polish", () => {
  it("F3: figures shown together take the size the longest of them needs", () => {
    expect(kpiGroupClass(["KD 890.000", "110.0%", "—"])).toBe(kpiAmountClass("KD 890.000"))
    expect(kpiGroupClass(["110.0%", "KD 890.000"])).toContain("text-lg")
    expect(kpiGroupClass(["KD 9.000", "77.4%"])).toContain("text-xl")
  })

  it("F4: a month other than this month reads its name and year, never YYYY-MM", () => {
    expect(labelForYM("2025-12")).toBe("December 2025")
    expect(labelForYM(toYearMonth(today()))).toBe("This Month")
  })

  it("F8: the budget amount's readout shows the exact value", () => {
    render(<BudgetDialog open onOpenChange={() => {}} initialMonth="2026-10" mode="create" onSave={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Amount (KD)"), { target: { value: "1,234.5" } })
    expect(screen.getByTestId("money-input-readout")).toHaveTextContent("KD 1,234.500")
  })

  it("F8: the budget saves the normalizer's exact 3-decimal value", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<BudgetDialog open onOpenChange={() => {}} initialMonth="2026-10" mode="create" onSave={onSave} />)
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Groceries" } })
    fireEvent.change(screen.getByLabelText("Amount (KD)"), { target: { value: "1,234.5" } })
    fireEvent.click(screen.getByRole("button", { name: "Save Budget" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ month: "2026-10", category: "Groceries", amount_kd: "1234.500" }))
  })

  it("MOB-R89 B2: mid-sentence month comes from the key and Kuwait's clock, not the device's", () => {
    // 21:30Z on Sat 31 Oct 2026: the device (UTC) says October, Kuwait says Sun 1 Nov.
    const tz = process.env.TZ
    process.env.TZ = "UTC"
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-31T21:30:00Z"))
    try {
      expect(monthPhraseFor("2026-11")).toBe("this month")
      expect(monthPhraseFor("2026-10")).toBe("October 2026")
      expect(monthPhraseFor("2025-12")).toBe("December 2025")
    } finally {
      vi.useRealTimers()
      process.env.TZ = tz
    }
  })
})

afterEach(() => {
  vi.useRealTimers()
})
