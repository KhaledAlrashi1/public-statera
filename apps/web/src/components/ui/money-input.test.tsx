import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MoneyInput } from "./money-input"

/** Controlled harness so `value` round-trips exactly like a real parent. */
function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <MoneyInput aria-label="amount" value={value} onValueChange={setValue} />
  )
}

describe("MoneyInput", () => {
  it("filters non-numeric characters and collapses to a single dot while typing", () => {
    render(<Harness />)
    const input = screen.getByLabelText("amount") as HTMLInputElement
    fireEvent.change(input, { target: { value: "12ab.3.4" } })
    expect(input.value).toBe("12.34")
  })

  it("normalizes to 3 decimals on blur", () => {
    render(<Harness />)
    const input = screen.getByLabelText("amount") as HTMLInputElement
    fireEvent.change(input, { target: { value: "12.5" } })
    fireEvent.blur(input)
    expect(input.value).toBe("12.500")
  })

  it("keeps empty as empty and shows the placeholder", () => {
    render(<Harness />)
    const input = screen.getByLabelText("amount") as HTMLInputElement
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.blur(input)
    expect(input.value).toBe("")
    expect(input.placeholder).toBe("0.000")
  })

  it("blur on a lone dot emits empty", () => {
    render(<Harness initial="." />)
    const input = screen.getByLabelText("amount") as HTMLInputElement
    fireEvent.blur(input)
    expect(input.value).toBe("")
    expect(input.placeholder).toBe("0.000")
  })

  it("strips thousands commas on paste and normalizes on blur", () => {
    render(<Harness />)
    const input = screen.getByLabelText("amount") as HTMLInputElement
    fireEvent.change(input, { target: { value: "1,234.5" } })
    expect(input.value).toBe("1234.5")
    fireEvent.blur(input)
    expect(input.value).toBe("1234.500")
  })

  it("truncates (does not round) excess decimals while typing", () => {
    render(<Harness />)
    const input = screen.getByLabelText("amount") as HTMLInputElement
    fireEvent.change(input, { target: { value: "1234.5555" } })
    expect(input.value).toBe("1234.555")
  })
})
