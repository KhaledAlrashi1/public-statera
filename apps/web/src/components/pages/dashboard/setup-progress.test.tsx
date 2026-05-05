import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SetupGuideDialog, SetupProgressPanel } from "./sections"

function makeSteps() {
  return [
    {
      key: "income",
      title: "Set your income",
      description: "Add your monthly income and payday in Profile.",
      done: false,
      actionLabel: "Set Income",
      onAction: vi.fn(),
    },
    {
      key: "transactions",
      title: "Import or add transactions",
      description: "Start generating activity insights.",
      done: true,
      actionLabel: "Add Activity",
      onAction: vi.fn(),
    },
    {
      key: "budget",
      title: "Set your first budget",
      description: "Turn history into guidance.",
      done: false,
      actionLabel: "Set Budget",
      onAction: vi.fn(),
    },
  ]
}

describe("SetupProgressPanel", () => {
  it("renders progress counts and pending actions", () => {
    const steps = makeSteps()
    render(<SetupProgressPanel isLoading={false} steps={steps} onDismiss={vi.fn()} />)

    expect(screen.getByText("Finish setup")).toBeInTheDocument()
    expect(screen.getByText("1 of 3 completed")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Set Income" })).toBeInTheDocument()
    expect(screen.getByText("Completed")).toBeInTheDocument()
  })

  it("runs step actions and dismiss callback", () => {
    const steps = makeSteps()
    const onDismiss = vi.fn()
    render(<SetupProgressPanel isLoading={false} steps={steps} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole("button", { name: "Set Budget" }))
    expect(steps[2].onAction).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: /dismiss setup progress/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("renders and runs the optional demo action", () => {
    const onDemo = vi.fn()
    render(
      <SetupProgressPanel
        isLoading={false}
        steps={makeSteps()}
        onDismiss={vi.fn()}
        demoAction={{
          label: "Load demo workspace",
          description: "Preview the product with realistic sample data.",
          onAction: onDemo,
        }}
      />
    )

    expect(screen.getByText(/preview the product with realistic sample data/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Load demo workspace" }))
    expect(onDemo).toHaveBeenCalledTimes(1)
  })

  it("renders and runs the optional guided action", () => {
    const onGuide = vi.fn()
    render(
      <SetupProgressPanel
        isLoading={false}
        steps={makeSteps()}
        onDismiss={vi.fn()}
        primaryAction={{
          label: "Start guided setup",
          description: "Follow one focused next step at a time.",
          onAction: onGuide,
        }}
      />
    )

    expect(screen.getByText(/follow one focused next step at a time/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Start guided setup" }))
    expect(onGuide).toHaveBeenCalledTimes(1)
  })

  it("renders loading skeletons", () => {
    render(<SetupProgressPanel isLoading steps={makeSteps()} onDismiss={vi.fn()} />)

    expect(screen.getByText("Finish setup")).toBeInTheDocument()
    expect(document.querySelectorAll(".skeleton")).toHaveLength(3)
  })
})

describe("SetupGuideDialog", () => {
  it("highlights the next incomplete step and runs its action", () => {
    const steps = makeSteps()
    render(
      <SetupGuideDialog
        open
        onOpenChange={vi.fn()}
        steps={steps}
      />
    )

    expect(screen.getByText("Guided setup")).toBeInTheDocument()
    expect(screen.getByText(/next up: set your income/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Set Income" }))
    expect(steps[0].onAction).toHaveBeenCalledTimes(1)
  })

  it("shows the completion state once every step is done", () => {
    const doneSteps = makeSteps().map((step) => ({ ...step, done: true }))
    render(
      <SetupGuideDialog
        open
        onOpenChange={vi.fn()}
        steps={doneSteps}
      />
    )

    expect(screen.getByText("Setup complete")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open dashboard" })).toBeInTheDocument()
  })
})
