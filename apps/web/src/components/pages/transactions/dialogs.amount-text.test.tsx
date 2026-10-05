import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AddTransactionDialog } from "./dialogs"

// MOB-R63 D / RM-27 — the QuickAdd path: typed amount text is read through the one normalizer
// (MoneyInput -> lib/amount-text), the readout under Amount shows the value before saving, and
// the value saved is exactly the one the readout showed. An unreadable value saves nothing.
// The device writes decimals with "." (jsdom's default locale, en-US), like the tester's iPhone;
// the last case stubs a "," device.

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  dupCheck: vi.fn(),
  suggestions: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  transactionsApi: {
    create: mocks.create,
    dupCheck: mocks.dupCheck,
    suggestions: mocks.suggestions,
  },
}))

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

const CASES: ReadonlyArray<[label: string, typed: string, saved: string | null, readout: string | null]> = [
  ["1.5", "1.5", "1.500", "KD 1.500"],
  ["1,5", "1,5", null, "Can't read this amount."],
  ["1,500", "1,500", "1500.000", "KD 1,500.000"],
  ["U+0661 U+066B U+0665", "\u0661\u066B\u0665", "1.500", "KD 1.500"],
  ["U+0661 U+0665", "\u0661\u0665", "15.000", "KD 15.000"],
  ["1,250.5", "1,250.5", "1250.500", "KD 1,250.500"],
  ["1,2,3", "1,2,3", null, "Can't read this amount."],
  ["(empty)", "", null, null],
]

async function enterAndSave(typed: string) {
  render(
    <AddTransactionDialog open onOpenChange={vi.fn()} categories={["Food"]} onSuccess={vi.fn()} initialType="expense" />
  )
  const amount = screen.getByLabelText("Amount (KD)") as HTMLInputElement
  fireEvent.change(amount, { target: { value: typed } })
  return amount
}

function submit() {
  const name = screen.getByLabelText("What was this for?")
  fireEvent.change(name, { target: { value: "Lunch" } })
  fireEvent.submit(name.closest("form")!)
}

describe("QuickAdd amount text (MOB-R63 D)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dupCheck.mockResolvedValue({ count: 0 })
    mocks.create.mockResolvedValue({ ok: true })
    mocks.suggestions.mockResolvedValue({ items: [] })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each(CASES)("%s", async (_label, typed, saved, readout) => {
    const amount = await enterAndSave(typed)
    // The box keeps the text as typed; nothing is stripped.
    expect(amount.value).toBe(typed)
    if (readout === null) expect(screen.queryByTestId("money-input-readout")).toBeNull()
    else expect(screen.getByTestId("money-input-readout")).toHaveTextContent(readout)

    submit()
    if (saved === null) {
      await waitFor(() => expect(screen.getAllByText("Amount is required.").length).toBeGreaterThan(0))
      expect(mocks.create).not.toHaveBeenCalled()
    } else {
      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ amount_kd: saved }))
    }
  })

  it("on a device that writes decimals with ',', 1,5 saves 1.500", async () => {
    vi.spyOn(Intl, "NumberFormat").mockImplementation(
      () =>
        ({
          formatToParts: () => [
            { type: "integer", value: "1" },
            { type: "decimal", value: "," },
            { type: "fraction", value: "5" },
          ],
        }) as unknown as Intl.NumberFormat,
    )
    await enterAndSave("1,5")
    expect(screen.getByTestId("money-input-readout")).toHaveTextContent("KD 1.500")
    submit()
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ amount_kd: "1.500" }))
  })
})
