// MOB-R88 F2 — /log is outside AppShell, so it resets its own scroll: entering it scrolls to the top-left.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import LogPage from "./LogPage"

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: vi.fn().mockResolvedValue([]), create: vi.fn(), delete: vi.fn(), get: vi.fn().mockResolvedValue({ ok: true, data: null }) },
    categoriesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
  }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

describe("/log opens at the top (MOB-R88 F2)", () => {
  it("scrolls to 0,0 on entry, new and edit", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
    for (const path of ["/log", "/log?edit=7"]) {
      scrollTo.mockClear()
      const { unmount } = render(
        <MemoryRouter initialEntries={[path]}>
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <Routes>
              <Route path="/log" element={<LogPage />} />
            </Routes>
          </QueryClientProvider>
        </MemoryRouter>,
      )
      expect(scrollTo).toHaveBeenCalledWith(0, 0)
      unmount()
    }
    scrollTo.mockRestore()
  })
})
