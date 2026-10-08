import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { IncomeQuickDialog } from "./IncomeQuickDialog"

// MOB-R46/R47 Part A — the income pop-up sends only monthly_income_kd, never null, and refreshes the
// four query keys the typed income feeds.

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/api", () => ({
  authApi: { updateProfile: mocks.updateProfile },
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: mocks.toast.success, error: mocks.toast.error, warning: vi.fn(), info: vi.fn() }),
}))

function renderDialog(initialValue?: string | null) {
  const queryClient = new QueryClient()
  const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined)
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <IncomeQuickDialog open onOpenChange={onOpenChange} initialValue={initialValue} />
    </QueryClientProvider>
  )
  return { invalidate, onOpenChange }
}

const amount = () => screen.getByLabelText("Monthly income") as HTMLInputElement
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }))

describe("IncomeQuickDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateProfile.mockResolvedValue({ profile: { monthly_income_kd: "1500.000" } })
  })

  it("saves only monthly_income_kd, refreshes the four income queries, and closes", async () => {
    const { invalidate, onOpenChange } = renderDialog()
    fireEvent.change(screen.getByLabelText("Monthly income"), { target: { value: "1500" } })
    save()

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mocks.updateProfile).toHaveBeenCalledTimes(1)
    expect(mocks.updateProfile.mock.calls[0][0]).toEqual({ monthly_income_kd: "1500.000" })
    expect(invalidate.mock.calls.map(([f]) => (f as { queryKey: string[] }).queryKey[0]).sort()).toEqual(
      ["auth-profile", "budgets", "dashboard-bundle", "insights"],
    )
  })

  it("an empty box with no income saved sends nothing and closes", async () => {
    const { onOpenChange } = renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mocks.updateProfile).not.toHaveBeenCalled()
  })

  // MoneyInput caps decimals at 3 while typing, so the invalid value that can actually reach the
  // dialog is zero — rejected here as it is by the server's parseKd.
  it("a zero amount shows the error and sends nothing — never null", () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText("Monthly income"), { target: { value: "0.000" } })
    save()
    expect(screen.getByText("Enter an amount above zero, with up to 3 decimals.")).toBeInTheDocument()
    expect(mocks.updateProfile).not.toHaveBeenCalled()
  })

  it("prefills the current income for Edit income", () => {
    renderDialog("1500.000")
    expect((screen.getByLabelText("Monthly income") as HTMLInputElement).value).toBe("1500.000")
  })
})
