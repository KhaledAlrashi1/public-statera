import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import BankPage from "./BankPage"

const mocks = vi.hoisted(() => ({
  bankApi: {
    listProviders: vi.fn(),
    listConnections: vi.fn(),
    listConsents: vi.fn(),
    getDataAccessLog: vi.fn(),
    syncPreview: vi.fn(),
    commit: vi.fn(),
    connect: vi.fn(),
    beginAuthorization: vi.fn(),
    revoke: vi.fn(),
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/lib/api", () => ({
  bankApi: mocks.bankApi,
}))

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    flags: { enable_open_banking: true },
  }),
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({
    toast: vi.fn(),
    success: mocks.toast.success,
    error: mocks.toast.error,
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

  render(
    <MemoryRouter initialEntries={["/bank"]}>
      <QueryClientProvider client={queryClient}>
        <BankPage />
      </QueryClientProvider>
    </MemoryRouter>
  )

  return { invalidateSpy }
}

describe("BankPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.bankApi.listProviders.mockResolvedValue([
      {
        provider: "fakebank",
        display_name: "FakeBank",
        ready: true,
        connect_mode: "direct",
        missing_config: [],
      },
    ])
    mocks.bankApi.listConnections.mockResolvedValue([
      {
        id: 11,
        provider: "fakebank",
        institution_name: "FakeBank",
        status: "active",
        last_synced_at: null,
      },
    ])
    mocks.bankApi.listConsents.mockResolvedValue([])
    mocks.bankApi.getDataAccessLog.mockResolvedValue([])
    mocks.bankApi.syncPreview.mockResolvedValue({
      sync_run_id: 77,
      staged_count: 1,
      provider_dup_count: 0,
      rows: [
        {
          raw_tx_id: 1,
          provider_tx_id: "fakebank_1",
          date: "2026-03-10",
          description: "Salary",
          amount_kd: "1000.000",
          likely_dup: false,
        },
      ],
      next_cursor: null,
    })
    mocks.bankApi.commit.mockResolvedValue({
      committed_count: 1,
      skipped_dup_count: 0,
      transaction_ids: [501],
    })
  })

  it("invalidates dashboard bundle and safe-to-spend after sync commit", async () => {
    const { invalidateSpy } = renderPage()

    const syncPreviewButton = await screen.findByRole("button", { name: "Run Sync Preview" })
    await waitFor(() => expect(syncPreviewButton).toBeEnabled())

    fireEvent.click(syncPreviewButton)

    await waitFor(() => {
      expect(mocks.bankApi.syncPreview).toHaveBeenCalledWith(11, { limit: 25 })
    })
    expect(await screen.findByText("Staged rows")).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "Commit Staged Transactions" })).toBeInTheDocument()

    invalidateSpy.mockClear()
    fireEvent.click(screen.getByRole("button", { name: "Commit Staged Transactions" }))

    await waitFor(() => {
      expect(mocks.bankApi.commit).toHaveBeenCalledWith(11, 77, {
        default_category: "Uncategorized",
      })
    })

    expect(
      invalidateSpy.mock.calls.some(
        ([args]: [{ queryKey?: unknown[] }]) => JSON.stringify(args.queryKey) === JSON.stringify(["dashboard-bundle"])
      )
    ).toBe(true)
    expect(
      invalidateSpy.mock.calls.some(
        ([args]: [{ queryKey?: unknown[] }]) => JSON.stringify(args.queryKey) === JSON.stringify(["safe-to-spend"])
      )
    ).toBe(true)
  })

  it("shows an OAuth redirect interstitial before leaving for bank authorization", async () => {
    mocks.bankApi.listProviders.mockResolvedValue([
      {
        provider: "oauthbank",
        display_name: "OAuth Bank",
        ready: true,
        connect_mode: "oauth_redirect",
        integration_status: "beta",
        missing_config: [],
      },
    ])
    mocks.bankApi.listConnections.mockResolvedValue([])
    mocks.bankApi.beginAuthorization.mockResolvedValue({
      authorization_url: "https://bank.example/authorize",
    })

    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Start authorization with OAuth Bank" }))

    expect(await screen.findByText("Redirecting to your bank")).toBeInTheDocument()
    expect(screen.getByText(/authorize secure read-only access/i)).toBeInTheDocument()
    expect(mocks.bankApi.beginAuthorization).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Continue to OAuth Bank" })).toBeInTheDocument()
  })

  it("explains how likely duplicates are detected during sync preview", async () => {
    mocks.bankApi.syncPreview.mockResolvedValue({
      sync_run_id: 77,
      staged_count: 1,
      provider_dup_count: 0,
      rows: [
        {
          raw_tx_id: 1,
          provider_tx_id: "fakebank_1",
          date: "2026-03-10",
          description: "Salary",
          amount_kd: "1000.000",
          likely_dup: true,
        },
      ],
      next_cursor: null,
    })

    renderPage()

    const syncPreviewButton = await screen.findByRole("button", { name: "Run Sync Preview" })
    await waitFor(() => expect(syncPreviewButton).toBeEnabled())

    fireEvent.click(syncPreviewButton)

    expect(await screen.findByText("Likely duplicates detected")).toBeInTheDocument()
    expect(screen.getByText(/same date, normalized description, and amount/i)).toBeInTheDocument()
  })

  it("renders query errors inline instead of falling back to empty sections", async () => {
    mocks.bankApi.listConnections.mockRejectedValueOnce(new Error("Connections offline"))

    renderPage()

    expect(await screen.findByText("Connections unavailable")).toBeInTheDocument()
    expect(screen.getByText("Connections offline")).toBeInTheDocument()
  })
})
