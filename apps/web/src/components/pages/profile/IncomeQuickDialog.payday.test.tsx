// MOB-R91 C1 — "Income and payday": one sheet; income through the amount normalizer, optional; payday 1–31,
// optional, the 1st reading "1st · calendar month". Save sends only the fields she changed; clearing an income
// she had sends null; nothing changed sends nothing.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))
vi.mock("@/lib/api", () => ({ authApi: { updateProfile: mocks.updateProfile } }))
vi.mock("@/components/ui/toaster", () => ({ useToast: () => mocks.toast }))

import { IncomeQuickDialog, paydayLabel } from "./IncomeQuickDialog"

function renderSheet(props: { initialValue?: string | null; initialPayday?: number | null }) {
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <IncomeQuickDialog open onOpenChange={onOpenChange} {...props} />
    </QueryClientProvider>,
  )
  return onOpenChange
}
const income = () => screen.getByLabelText("Monthly income") as HTMLInputElement
const payday = () => screen.getByLabelText("Payday") as HTMLSelectElement
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateProfile.mockResolvedValue({ ok: true, profile: {} })
})

describe("Income and payday sheet (MOB-R91 C1)", () => {
  it("shows the ruled strings; payday has 31 days and the 1st reads as the calendar month", () => {
    renderSheet({ initialValue: null, initialPayday: null })
    expect(screen.getByRole("heading", { name: "Income and payday" })).toBeInTheDocument()
    expect(screen.getByText("If it varies, use your average month.")).toBeInTheDocument()
    expect(screen.getByText("Your month starts on this day.")).toBeInTheDocument()
    expect(screen.getByText("You can change these anytime in Profile.")).toBeInTheDocument()
    expect(payday().options).toHaveLength(31)
    expect(payday().selectedOptions[0].textContent).toBe("1st · calendar month")
    expect(Array.from(payday().options).map((o) => o.textContent).slice(1, 4)).toEqual(["2nd", "3rd", "4th"])
    expect(paydayLabel(21)).toBe("21st")
    expect(paydayLabel(12)).toBe("12th")
  })

  it("sends only the payday when only the payday changed (the same income typed differently is unchanged)", async () => {
    renderSheet({ initialValue: "1500.000", initialPayday: null })
    fireEvent.change(income(), { target: { value: "1,500" } })
    fireEvent.change(payday(), { target: { value: "25" } })
    save()
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledTimes(1))
    expect(mocks.updateProfile).toHaveBeenCalledWith({ payday_day: 25 })
  })

  it("sends the income through the normalizer when only the income changed", async () => {
    renderSheet({ initialValue: "1500.000", initialPayday: 25 })
    fireEvent.change(income(), { target: { value: "1,750.5" } })
    save()
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith({ monthly_income_kd: "1750.500" }))
  })

  it("clearing an income she had sends null; with nothing changed nothing is sent and the sheet closes", async () => {
    const onOpenChange = renderSheet({ initialValue: "900.000", initialPayday: 3 })
    fireEvent.change(income(), { target: { value: "" } })
    save()
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith({ monthly_income_kd: null }))
    mocks.updateProfile.mockClear()
    onOpenChange.mockClear()
    fireEvent.change(income(), { target: { value: "900" } })
    save()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mocks.updateProfile).not.toHaveBeenCalled()
  })

  it("text it cannot read as an amount sends nothing and says why", async () => {
    renderSheet({ initialValue: null, initialPayday: null })
    fireEvent.change(income(), { target: { value: "1,5,0" } })
    save()
    expect(await screen.findByText("Can't read this amount.")).toBeInTheDocument()
    expect(mocks.updateProfile).not.toHaveBeenCalled()
  })
})

// MOB-R95 B1 — the toast names what changed.
describe("Income and payday sheet — the saved toast (MOB-R95 B1)", () => {
  it("income set or changed only: Monthly income saved", async () => {
    const onOpenChange = renderSheet({ initialValue: "1500.000", initialPayday: 25 })
    fireEvent.change(income(), { target: { value: "1600" } })
    save()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mocks.updateProfile).toHaveBeenCalledWith({ monthly_income_kd: "1600.000" })
    expect(mocks.toast.success).toHaveBeenCalledWith("Monthly income saved")
  })

  it("income cleared only: Monthly income cleared", async () => {
    const onOpenChange = renderSheet({ initialValue: "1500.000", initialPayday: 25 })
    fireEvent.change(income(), { target: { value: "" } })
    save()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mocks.updateProfile).toHaveBeenCalledWith({ monthly_income_kd: null })
    expect(mocks.toast.success).toHaveBeenCalledWith("Monthly income cleared")
  })

  it("payday only: Payday saved", async () => {
    const onOpenChange = renderSheet({ initialValue: "1500.000", initialPayday: 25 })
    fireEvent.change(payday(), { target: { value: "27" } })
    save()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mocks.updateProfile).toHaveBeenCalledWith({ payday_day: 27 })
    expect(mocks.toast.success).toHaveBeenCalledWith("Payday saved")
  })

  it("both: Income and payday saved", async () => {
    const onOpenChange = renderSheet({ initialValue: "1500.000", initialPayday: 25 })
    fireEvent.change(income(), { target: { value: "1600" } })
    fireEvent.change(payday(), { target: { value: "27" } })
    save()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mocks.updateProfile).toHaveBeenCalledWith({ monthly_income_kd: "1600.000", payday_day: 27 })
    expect(mocks.toast.success).toHaveBeenCalledWith("Income and payday saved")
  })
})
