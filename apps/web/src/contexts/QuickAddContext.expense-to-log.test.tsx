// MOB-R69 D1 — every expense entry opens /log. The old sheet still opens for income; choosing
// "Expense" in it now closes it and opens /log instead of turning it into an expense form.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { QuickAddProvider, useQuickAdd } from "./QuickAddContext"
import { AddTransactionDialog } from "@/components/pages/transactions/dialogs"

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return { ...actual, useNavigate: () => mocks.navigate }
})

vi.mock("@/lib/api", () => ({
  categoriesApi: { list: vi.fn().mockResolvedValue([]) },
  transactionsApi: {
    create: vi.fn(),
    dupCheck: vi.fn(),
    suggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  },
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

function OpenIncome() {
  const { openQuickAdd } = useQuickAdd()
  return <button type="button" onClick={() => openQuickAdd("income")}>open income</button>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("QuickAdd — Expense hands over to /log (MOB-R69 D1)", () => {
  it("choosing Expense in the income sheet closes it and opens /log", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <QuickAddProvider onChooseExpense={() => mocks.navigate("/log")}>
            <OpenIncome />
          </QuickAddProvider>
        </QueryClientProvider>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole("button", { name: "open income" }))
    expect(await screen.findByRole("heading", { name: "Add Income" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Expense" }))
    expect(mocks.navigate).toHaveBeenCalledWith("/log")
    expect(screen.queryByRole("heading", { name: "Add Expense" })).toBeNull()
  })

  it("without a hand-over (the sheet on its own) the toggle still switches the form", () => {
    render(
      <AddTransactionDialog open onOpenChange={vi.fn()} categories={["Groceries"]} onSuccess={vi.fn()} initialType="income" />
    )
    fireEvent.click(screen.getByRole("button", { name: "Expense" }))
    expect(screen.getByRole("heading", { name: "Add Expense" })).toBeInTheDocument()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
