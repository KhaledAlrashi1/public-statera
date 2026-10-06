/**
 * MOB-R36 #22 — the Activity income view says where planning's income comes from.
 *
 * Income is typed-only: logged income transactions are kept for the user's records, but every
 * planning figure uses the monthly income in Profile. The note sits under the page header on the
 * INCOME view only. Every child component is mocked to nothing so the page's own header is what is
 * observed.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/api", () => ({
  authApi: { profile: vi.fn().mockResolvedValue({ ok: true, profile: null }), clearDemoData: vi.fn() },
  categoriesApi: { list: vi.fn().mockResolvedValue([]) },
  merchantsApi: { list: vi.fn().mockResolvedValue([]) },
  transactionsApi: { bulkDelete: vi.fn() },
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

const NOTE = "Logged income is for your records. Planning uses the monthly income in Profile."

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

describe("TransactionsPage — income view note (MOB-R36 #22)", () => {
  it("shows the note on the income view, and not on the expense view", () => {
    const { unmount } = renderAt("/activity?type=income")
    expect(screen.getByText("Track, import, and manage income")).toBeInTheDocument()
    expect(screen.getByText(NOTE)).toBeInTheDocument()
    unmount()

    // NEGATIVE — the expense view renders its own header and no note.
    renderAt("/activity?type=expense")
    expect(screen.getByText("Track, import, and manage expenses")).toBeInTheDocument()
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })
})
