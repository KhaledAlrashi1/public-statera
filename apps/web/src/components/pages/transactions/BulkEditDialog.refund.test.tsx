// MOB-R116 D3 — bulk edit PATCHes each changed row with its stored amount. PATCH takes a magnitude and keeps the row's
// sign, so a refund row (stored negative) sends its magnitude; a spending row sends its amount as before.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))
vi.mock("@/lib/api", () => ({ transactionsApi: { get: mocks.get, update: mocks.update } }))
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

import { BulkEditDialog } from "./BulkEditDialog"

const rows: Record<number, unknown> = {
  5: { id: 5, date: "2026-10-10", name: "Caribou refund", merchant: "Caribou Coffee", category: "Dining", amount_kd: "-2.250", memo: null, category_counts_as_income: false },
  6: { id: 6, date: "2026-10-09", name: "Latte", merchant: "Caribou Coffee", category: "Dining", amount_kd: "3.500", memo: null, category_counts_as_income: false },
}

describe("BulkEditDialog — refunds (MOB-R116 D3)", () => {
  it("a refund row sends its magnitude; a spending row sends its amount unchanged", async () => {
    mocks.get.mockImplementation((id: number) => Promise.resolve({ ok: true, data: { item: rows[id] } }))
    mocks.update.mockResolvedValue({ ok: true, data: { item: {} } })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BulkEditDialog open onOpenChange={vi.fn()} selectedIds={[5, 6]} categories={["Dining"]} merchants={[]} onSuccess={vi.fn()} />
      </QueryClientProvider>,
    )
    await screen.findAllByDisplayValue("Caribou refund")
    fireEvent.change(screen.getAllByPlaceholderText("Leave blank to keep existing")[1], { target: { value: "Renamed" } })
    fireEvent.click(screen.getByRole("button", { name: "Apply to all rows" }))
    fireEvent.click(screen.getByRole("button", { name: "Save All" }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2))
    const byId = Object.fromEntries(mocks.update.mock.calls.map(([id, b]) => [id, b]))
    expect(byId[5]).toEqual({ date: "2026-10-10", name: "Renamed", category: "Dining", merchant: "Caribou Coffee", amount_kd: "2.250" })
    expect(byId[6]).toEqual({ date: "2026-10-09", name: "Renamed", category: "Dining", merchant: "Caribou Coffee", amount_kd: "3.500" })
  })
})
