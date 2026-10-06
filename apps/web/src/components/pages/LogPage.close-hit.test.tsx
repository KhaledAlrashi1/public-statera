// MOB-R74 F (E4b) — the /log close control keeps its drawn 40px circle and gains a 44x44 hit area
// through an invisible ::before inset by -3px from the padding box (inside the 1px border). jsdom computes no layout, so this pins the class the
// hit area comes from; the 1px-outside hit test is measured in Playwright (WebKit and Chromium).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import LogPage, { LOG_CLOSE_HIT_AREA } from "./LogPage"

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ApiError: actual.ApiError,
    transactionsApi: { logSuggestions: vi.fn().mockResolvedValue([]), create: vi.fn(), delete: vi.fn() },
    categoriesApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
  }
})
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

describe("/log close control hit area (MOB-R74 F)", () => {
  it("draws a 40px circle and carries the ::before that makes the hit area 44x44", () => {
    render(
      <MemoryRouter initialEntries={["/log"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Routes>
            <Route path="/log" element={<LogPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const close = screen.getByRole("button", { name: "Back" })
    expect(LOG_CLOSE_HIT_AREA).toContain("before:-inset-[3px]")
    for (const cls of LOG_CLOSE_HIT_AREA.split(" ")) expect(close).toHaveClass(cls)
    for (const cls of ["h-10", "w-10", "rounded-full"]) expect(close).toHaveClass(cls)
  })
})
