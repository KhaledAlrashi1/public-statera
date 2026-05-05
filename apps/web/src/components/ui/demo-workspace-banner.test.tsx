import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DemoWorkspaceBanner } from "./demo-workspace-banner"

describe("DemoWorkspaceBanner", () => {
  it("renders demo counts and fires actions", () => {
    const onOpenImport = vi.fn()
    const onClearDemoWorkspace = vi.fn()

    render(
      <DemoWorkspaceBanner
        demoWorkspace={{
          active: true,
          clearable: true,
          loaded_at: "2026-03-06T12:00:00+00:00",
          month: "2026-03",
          months_seeded: 6,
          transactions: 49,
          budgets: 7,
          debt_accounts: 1,
          savings_goals: 1,
          profile_seeded_fields: ["monthly_income_kd"],
        }}
        onOpenImport={onOpenImport}
        onClearDemoWorkspace={onClearDemoWorkspace}
      />
    )

    expect(screen.getByText("Demo workspace is still active")).toBeInTheDocument()
    expect(screen.getByText(/49 demo transactions, 7 budgets, 1 debt account/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Import real data" }))
    fireEvent.click(screen.getByRole("button", { name: "Clear demo workspace" }))

    expect(onOpenImport).toHaveBeenCalledTimes(1)
    expect(onClearDemoWorkspace).toHaveBeenCalledTimes(1)
  })
})
