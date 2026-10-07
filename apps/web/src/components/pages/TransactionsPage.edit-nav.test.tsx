// MOB-R87 D1 (a) — a row tap in Activity opens the Log screen on that row: /log?edit=<id>, not a dialog.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

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
vi.mock("./transactions/TransactionsTable", () => ({
  default: ({ onEdit }: { onEdit: (id: number) => void }) => (
    <button type="button" onClick={() => onEdit(42)}>
      Edit row 42
    </button>
  ),
}))
vi.mock("./transactions/SettingsDialog", () => ({ default: () => null }))
vi.mock("./transactions/ImportDialogs", () => ({ ImportDialog: () => null, PreviewImportDialog: () => null }))
vi.mock("./transactions/BulkEditDialog", () => ({ BulkEditDialog: () => null }))

import TransactionsPage from "./TransactionsPage"

function Where() {
  const loc = useLocation()
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>
}

describe("Activity row tap (MOB-R87 D1 a)", () => {
  it("navigates to /log?edit=<id>", () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/activity"]}>
          <Routes>
            <Route path="/activity" element={<TransactionsPage />} />
            <Route path="/log" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit row 42" }))
    expect(screen.getByTestId("where")).toHaveTextContent("/log?edit=42")
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
