// MOB-R105 D1/D2 — the "Income and payday" sheet: one amount field showing the grouped value with no echo
// line under it, through the same normalizer; payday options read "<n>th of each month" and the hint names
// the month from the Kuwait clock, following the selection before Save.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))
vi.mock("@/lib/api", () => ({ authApi: { updateProfile: mocks.updateProfile } }))
vi.mock("@/components/ui/toaster", () => ({ useToast: () => mocks.toast }))

import { IncomeQuickDialog } from "./IncomeQuickDialog"

function renderSheet(props: { initialValue?: string | null; initialPayday?: number | null }) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <IncomeQuickDialog open onOpenChange={vi.fn()} {...props} />
    </QueryClientProvider>,
  )
}
const income = () => screen.getByLabelText("Monthly income") as HTMLInputElement
const payday = () => screen.getByLabelText("Payday") as HTMLSelectElement

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateProfile.mockResolvedValue({ ok: true, profile: {} })
})
afterEach(() => vi.useRealTimers())

describe("Income and payday sheet — the amount field (MOB-R105 D1)", () => {
  it("shows the grouped value with no echo line, and saves the same value as before", async () => {
    renderSheet({ initialValue: "1500.000", initialPayday: 25 })
    expect(income().value).toBe("1,500.000")
    expect(screen.queryByTestId("money-input-readout")).not.toBeInTheDocument()

    fireEvent.change(income(), { target: { value: "2500" } })
    expect(income().value).toBe("2,500")
    expect(screen.queryByTestId("money-input-readout")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith({ monthly_income_kd: "2500.000" }))
  })

  it("still says when it cannot read the text, and sends nothing", () => {
    renderSheet({ initialValue: null, initialPayday: null })
    fireEvent.change(income(), { target: { value: "12abc" } })
    expect(screen.getByTestId("money-input-readout").textContent).toBe("Can't read this amount.")
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(mocks.updateProfile).not.toHaveBeenCalled()
  })
})

describe("Income and payday sheet — payday (MOB-R105 D2)", () => {
  it("labels each day 'of each month' and names this month from the Kuwait clock as she picks", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    // Fri 16 Oct 2026, 12:00 in Kuwait.
    vi.setSystemTime(new Date("2026-10-16T09:00:00Z"))
    renderSheet({ initialValue: null, initialPayday: null })
    const labels = Array.from(payday().options).map((o) => o.textContent)
    expect(labels.slice(0, 3)).toEqual(["1st of each month", "2nd of each month", "3rd of each month"])
    expect(labels[24]).toBe("25th of each month")
    expect(screen.getByText("This month runs 1 Oct to 31 Oct.")).toBeInTheDocument()

    fireEvent.change(payday(), { target: { value: "25" } })
    expect(screen.getByText("This month runs 25 Sep to 24 Oct.")).toBeInTheDocument()
    fireEvent.change(payday(), { target: { value: "31" } })
    expect(screen.getByText("This month runs 30 Sep to 30 Oct.")).toBeInTheDocument()
    expect(mocks.updateProfile).not.toHaveBeenCalled()

    // 21:30 UTC on 15 Oct is 00:30 on 16 Oct in Kuwait: payday 16 has already started a new month there.
    vi.setSystemTime(new Date("2026-10-15T21:30:00Z"))
    fireEvent.change(payday(), { target: { value: "16" } })
    expect(screen.getByText("This month runs 16 Oct to 15 Nov.")).toBeInTheDocument()
  })
})
