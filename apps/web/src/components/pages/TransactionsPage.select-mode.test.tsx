/**
 * MOB-R81 C6 / C7 — Activity's checkboxes and bulk bar appear only in a "Select" mode; "Done" leaves it
 * and clears the selection. The page reads "Activity". The table is a stub that reports the props the
 * page passes, so the page's own state is what is observed; the harness mirrors
 * TransactionsPage.log-entry.test.tsx's.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
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
vi.mock("@/components/ui/toaster", () => ({ useToast: () => mocks.toast }))
vi.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }))
vi.mock("@/components/ui/demo-workspace-banner", () => ({ DemoWorkspaceBanner: () => null }))
vi.mock("./transactions/dialogs", () => ({ EditTransactionDialog: () => null }))
vi.mock("./transactions/TransactionsTable", () => ({
  default: (props: { selecting?: boolean; onToggleSelect?: (id: number) => void }) =>
    props.selecting ? (
      <input type="checkbox" aria-label="Select transaction Dinner" onChange={() => props.onToggleSelect?.(1)} />
    ) : null,
}))
vi.mock("./transactions/SettingsDialog", () => ({ default: () => null }))
vi.mock("./transactions/ImportDialogs", () => ({ ImportDialog: () => null, PreviewImportDialog: () => null }))
vi.mock("./transactions/BulkEditDialog", () => ({ BulkEditDialog: () => null }))

import TransactionsPage from "./TransactionsPage"

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/activity?type=all"]}>
        <TransactionsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Activity Select mode (MOB-R81 C6)", () => {
  it("shows checkboxes and the bulk bar only after Select; Done hides both and clears the selection", () => {
    renderPage()
    expect(screen.queryByRole("checkbox")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Select" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Select transaction Dinner" }))
    expect(screen.getByText("1 selected")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByText("1 selected")).toBeNull()
    expect(screen.queryByRole("checkbox")).toBeNull()

    // Back in Select mode, the earlier selection is gone.
    fireEvent.click(screen.getByRole("button", { name: "Select" }))
    expect(screen.queryByText(/selected$/)).toBeNull()
  })

  it("the page's label reads Activity (MOB-R81 C7)", () => {
    renderPage()
    expect(screen.getByText("Activity")).toBeInTheDocument()
    expect(screen.queryByText("Transactions")).toBeNull()
  })
})
