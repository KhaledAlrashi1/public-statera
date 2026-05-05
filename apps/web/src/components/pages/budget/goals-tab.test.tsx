import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { GoalDialog, GoalProgressBar } from "./GoalsTab"

describe("GoalProgressBar", () => {
  it("renders 0% progress", () => {
    render(<GoalProgressBar current={0} target={100} />)
    expect(screen.getByText("0.0% complete")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Goal progress" })).toHaveAttribute("aria-valuenow", "0")
  })

  it("renders 50% progress", () => {
    render(<GoalProgressBar current={50} target={100} />)
    expect(screen.getByText("50.0% complete")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Goal progress" })).toHaveAttribute("aria-valuenow", "50")
  })

  it("caps progress at 100%", () => {
    render(<GoalProgressBar current={150} target={100} />)
    expect(screen.getByText("100.0% complete")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Goal progress" })).toHaveAttribute("aria-valuenow", "100")
  })
})

describe("GoalDialog", () => {
  it("validates required fields", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <GoalDialog
        open
        saving={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Create Goal" }))
    expect(await screen.findByText("Goal name is required.")).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("submits normalized values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <GoalDialog
        open
        saving={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    fireEvent.change(screen.getByLabelText("Goal name"), { target: { value: "Emergency Fund" } })
    fireEvent.change(screen.getByLabelText("Target amount (KD)"), { target: { value: "1000" } })
    fireEvent.change(screen.getByLabelText("Starting balance (optional)"), { target: { value: "50.5" } })
    fireEvent.change(screen.getByLabelText("Target date (optional)"), { target: { value: "2026-12-31" } })

    fireEvent.click(screen.getByRole("button", { name: "Create Goal" }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Emergency Fund",
        goal_type: "custom",
        target_kd: "1000.000",
        current_kd: "50.500",
        target_date: "2026-12-31",
      })
    })
  })

  it("rejects past target dates", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    render(
      <GoalDialog
        open
        saving={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    fireEvent.change(screen.getByLabelText("Goal name"), { target: { value: "Emergency Fund" } })
    fireEvent.change(screen.getByLabelText("Target amount (KD)"), { target: { value: "1000" } })
    fireEvent.change(screen.getByLabelText("Target date (optional)"), { target: { value: yesterday } })
    fireEvent.click(screen.getByRole("button", { name: "Create Goal" }))

    expect(await screen.findByText("Target date cannot be in the past.")).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("rejects duplicate goal names", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <GoalDialog
        open
        saving={false}
        existingNameKeys={["emergency fund"]}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    fireEvent.change(screen.getByLabelText("Goal name"), { target: { value: "Emergency Fund" } })
    fireEvent.change(screen.getByLabelText("Target amount (KD)"), { target: { value: "1000" } })
    fireEvent.click(screen.getByRole("button", { name: "Create Goal" }))

    expect(await screen.findByText("You already have a goal with this name.")).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("allows editing a goal without changing its name", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <GoalDialog
        open
        saving={false}
        mode="edit"
        initialValues={{
          name: "Emergency Fund",
          goal_type: "custom",
          target_kd: "1000.000",
        }}
        existingNameKeys={["emergency fund"]}
        currentGoalNameKey="emergency fund"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    fireEvent.change(screen.getByLabelText("Target amount (KD)"), { target: { value: "1200" } })
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Emergency Fund",
        goal_type: "custom",
        target_kd: "1200.000",
        current_kd: undefined,
        target_date: null,
      })
    })
    expect(screen.queryByText("You already have a goal with this name.")).not.toBeInTheDocument()
  })

  it("rejects starting balances above the target amount", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <GoalDialog
        open
        saving={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    fireEvent.change(screen.getByLabelText("Goal name"), { target: { value: "Travel Fund" } })
    fireEvent.change(screen.getByLabelText("Target amount (KD)"), { target: { value: "100" } })
    fireEvent.change(screen.getByLabelText("Starting balance (optional)"), { target: { value: "150" } })
    fireEvent.click(screen.getByRole("button", { name: "Create Goal" }))

    expect(await screen.findByText("Starting balance cannot exceed the target amount.")).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
