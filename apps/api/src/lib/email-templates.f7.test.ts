/**
 * MOB-R53 F7 — the budget-alert email names the product the user signed up for.
 *
 * The template was ported verbatim from Flask, where the product was still called DinarTrack;
 * every budget-alert email told the reader to "Open DinarTrack". Own file: no existing test is
 * edited.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("./email", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }))

import { renderEmailTemplate } from "./email-templates"

const ctx = {
  ratio_pct: 95,
  category: "Groceries",
  month_label: "May 2026",
  spent_kd: "190.000",
  budget_kd: "200.000",
}

describe("MOB-R53 F7 — budget_alert names Statera", () => {
  it("html body says Statera, never DinarTrack", () => {
    const { html } = renderEmailTemplate("budget_alert", ctx)
    // WITHOUT the change this reads "Open DinarTrack to review and adjust your plan."
    expect(html).toContain("Open Statera to review and adjust your plan.")
    expect(html).not.toMatch(/dinartrack/i)
  })

  it("text body says Statera, never DinarTrack", () => {
    const { text } = renderEmailTemplate("budget_alert", ctx)
    expect(text).toContain("Open Statera to review and adjust your plan.")
    expect(text).not.toMatch(/dinartrack/i)
  })
})
