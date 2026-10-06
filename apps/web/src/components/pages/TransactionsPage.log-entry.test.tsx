/**
 * MOB-R61 D2 — Activity's add button opens /log, the main expense entry, on a non-income view and
 * keeps QuickAdd on the income view. Every child component is mocked to nothing so the page's own
 * header button is what is observed; the harness mirrors TransactionsPage.test.tsx's.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openQuickAdd: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return { ...actual, useNavigate: () => mocks.navigate }
})
vi.mock("@/lib/api", () => ({
  authApi: { profile: vi.fn().mockResolvedValue({ ok: true, profile: null }), clearDemoData: vi.fn() },
  categoriesApi: { list: vi.fn().mockResolvedValue([]) },
  merchantsApi: { list: vi.fn().mockResolvedValue([]) },
  transactionsApi: { bulkDelete: vi.fn() },
}))
vi.mock("@/contexts/QuickAddContext", () => ({
  useQuickAdd: () => ({ openQuickAdd: mocks.openQuickAdd, closeQuickAdd: vi.fn() }),
}))
vi.mock("@/components/ui/toaster", () => ({ useToast: () => mocks.toast }))
vi.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }))
vi.mock("@/components/ui/demo-workspace-banner", () => ({ DemoWorkspaceBanner: () => null }))
vi.mock("./transactions/dialogs", () => ({ EditTransactionDialog: () => null }))
vi.mock("./transactions/TransactionsTable", () => ({ default: () => null }))
vi.mock("./transactions/SettingsDialog", () => ({ default: () => null }))
vi.mock("./transactions/ImportDialogs", () => ({ ImportDialog: () => null, PreviewImportDialog: () => null }))
vi.mock("./transactions/BulkEditDialog", () => ({ BulkEditDialog: () => null }))

import TransactionsPage from "./TransactionsPage"

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <TransactionsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("TransactionsPage — add button destination (MOB-R61 D2)", () => {
  it("opens /log on the expense view and offers no add button on the income view (MOB-R73 D3)", () => {
    renderAt("/activity?type=expense")
    fireEvent.click(screen.getByRole("button", { name: "Add Expense" }))
    expect(mocks.navigate).toHaveBeenCalledWith("/log")
    expect(mocks.openQuickAdd).not.toHaveBeenCalled()

    cleanup()
    vi.clearAllMocks()
    renderAt("/activity?type=income")
    expect(screen.queryByRole("button", { name: "Add Income" })).toBeNull()
    expect(mocks.openQuickAdd).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalledWith("/log")
  })
})
