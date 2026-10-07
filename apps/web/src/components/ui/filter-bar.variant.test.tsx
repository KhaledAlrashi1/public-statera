// MOB-R83 C3 — FilterBar's "plain" variant draws no box (it sits inside a card on Activity and Plan); the
// default keeps the box for its other readers (ExpensesPage, IncomePage).
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FilterBar } from "./filter-bar"

const BOX = ["border", "bg-card", "p-3", "rounded-[var(--radius-inner)]"]
// The box is the search field's parent: the input sits in its own bordered field, inside the box.
const box = (container: HTMLElement) => container.querySelector("input")!.parentElement!.parentElement as HTMLElement

describe("FilterBar variant (MOB-R83 C3)", () => {
  it("plain: the controls sit in no box", () => {
    const { container } = render(<FilterBar variant="plain" searchValue="" onSearchChange={vi.fn()} />)
    for (const c of BOX) expect(box(container)).not.toHaveClass(c)
  })

  it("default: the box stays", () => {
    const { container } = render(<FilterBar searchValue="" onSearchChange={vi.fn()} />)
    for (const c of BOX) expect(box(container)).toHaveClass(c)
  })
})
