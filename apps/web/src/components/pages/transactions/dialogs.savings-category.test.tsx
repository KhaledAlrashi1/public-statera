// MOB-R60 D1/D2 — QuickAdd hides the generic "Savings & investing" entry once the user owns a
// savings-kind category. Driven through the real QuickAddProvider, so the flag is the one computed
// from GET /api/categories' kind and threaded to the category field — not a prop set by the test.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { QuickAddProvider, useQuickAdd } from "@/contexts/QuickAddContext"

const mocks = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock("@/lib/api", () => ({
  categoriesApi: { list: mocks.list },
  transactionsApi: { create: vi.fn(), dupCheck: vi.fn(), suggestions: vi.fn().mockResolvedValue({ items: [] }) },
}))
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

function Opener() {
  const { openQuickAdd } = useQuickAdd()
  return <button type="button" onClick={() => openQuickAdd("expense")}>open</button>
}

async function categoryOptionsShown(categories: unknown[]) {
  mocks.list.mockResolvedValue(categories)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <QuickAddProvider>
        <Opener />
      </QuickAddProvider>
    </QueryClientProvider>,
  )
  // Wait for the categories to load (the user's own row appears in the list).
  fireEvent.click(screen.getByRole("button", { name: "open" }))
  const field = await screen.findByLabelText("Category")
  fireEvent.focus(field)
  await screen.findByRole("option", { name: "Savings" })
  return within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent)
}

describe("QuickAdd — generic savings entry (MOB-R60 D2)", () => {
  it("hides Savings & investing when the user owns a savings-kind category", async () => {
    const options = await categoryOptionsShown([
      { id: 1, name: "Groceries", kind: "expense" },
      { id: 2, name: "Savings", kind: "savings" },
    ])
    expect(options).not.toContain("Savings & investing")
  })
})
