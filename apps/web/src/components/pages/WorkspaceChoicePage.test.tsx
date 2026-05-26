import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import WorkspaceChoicePage from "./WorkspaceChoicePage"
import { markPendingWorkspaceChoice } from "@/lib/workspace-choice"

const mocks = vi.hoisted(() => ({
  loadDemoData: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  authApi: {
    loadDemoData: mocks.loadDemoData,
  },
  ApiError: class ApiError extends Error {
    status: number
    code?: string

    constructor(message: string, status: number, code?: string) {
      super(message)
      this.name = "ApiError"
      this.status = status
      this.code = code
    }
  },
}))

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { email: "ali@example.com", first_name: "Ali" },
  }),
  getUserFirstName: (user: { first_name?: string } | null) => user?.first_name ?? "",
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({
    toast: vi.fn(),
    success: mocks.success,
    error: mocks.error,
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

function renderPage(initialPath = "/welcome") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<div>Home page</div>} />
          <Route path="/welcome" element={<WorkspaceChoicePage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe("WorkspaceChoicePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
  })

  it("redirects home when there is no pending workspace choice and no signup param", () => {
    renderPage()

    expect(screen.getByText("Home page")).toBeInTheDocument()
  })

  it("allows access when source=signup param is present without sessionStorage flag", () => {
    renderPage("/welcome?source=signup")

    expect(screen.queryByText("Home page")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start with my own data" })).toBeInTheDocument()
  })

  it("lets the user continue with an empty workspace", () => {
    markPendingWorkspaceChoice()
    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Start with my own data" }))

    expect(screen.getByText("Home page")).toBeInTheDocument()
    expect(window.sessionStorage.getItem("pending-workspace-choice")).toBeNull()
  })

  it("loads the demo workspace and returns home", async () => {
    mocks.loadDemoData.mockResolvedValue({
      transactions_created: 47,
      months_seeded: 6,
    })
    markPendingWorkspaceChoice()
    renderPage()

    fireEvent.click(screen.getByRole("button", { name: "Load demo workspace" }))

    await waitFor(() => {
      expect(mocks.loadDemoData).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByText("Home page")).toBeInTheDocument()
    })
    expect(mocks.success).toHaveBeenCalledWith(
      "Loaded 47 demo transactions across 6 months."
    )
    expect(window.sessionStorage.getItem("pending-workspace-choice")).toBeNull()
  })
})
