// MOB-R60 E2 — the income pop-up tells the user they can change it later in Profile.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { IncomeQuickDialog } from "./IncomeQuickDialog"

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

describe("IncomeQuickDialog — copy (MOB-R60 E2)", () => {
  it("says the income can be changed later in Profile", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <IncomeQuickDialog open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    )
    expect(screen.getByText("You can change these anytime in Profile.")).toBeInTheDocument()
  })
})
