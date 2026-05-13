import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("./email", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }))

import { renderEmailTemplate, sendTemplatedEmail } from "./email-templates"
import { sendEmail } from "./email"

beforeEach(() => { vi.clearAllMocks() })

// ── renderEmailTemplate ───────────────────────────────────────────────────────

describe("renderEmailTemplate — budget_alert", () => {
  const ctx = {
    ratio_pct: 95,
    category: "Groceries",
    month_label: "May 2026",
    spent_kd: "190.000",
    budget_kd: "200.000",
  }

  it("interpolates all variables in html", () => {
    const { html } = renderEmailTemplate("budget_alert", ctx)
    expect(html).toContain("95%")
    expect(html).toContain("Groceries")
    expect(html).toContain("May 2026")
    expect(html).toContain("190.000")
    expect(html).toContain("200.000")
  })

  it("interpolates all variables in text", () => {
    const { text } = renderEmailTemplate("budget_alert", ctx)
    expect(text).toContain("95%")
    expect(text).toContain("Groceries")
    expect(text).toContain("May 2026")
    expect(text).toContain("190.000")
    expect(text).toContain("200.000")
  })
})

describe("renderEmailTemplate — goal_milestone", () => {
  const ctx = {
    milestone_pct: 50,
    goal_name: "Emergency Fund",
    current_kd: "500.000",
    target_kd: "1000.000",
  }

  it("interpolates all variables in html", () => {
    const { html } = renderEmailTemplate("goal_milestone", ctx)
    expect(html).toContain("50%")
    expect(html).toContain("Emergency Fund")
    expect(html).toContain("500.000")
    expect(html).toContain("1000.000")
  })

  it("interpolates all variables in text", () => {
    const { text } = renderEmailTemplate("goal_milestone", ctx)
    expect(text).toContain("50%")
    expect(text).toContain("Emergency Fund")
  })
})

describe("renderEmailTemplate — error cases", () => {
  it("throws on unknown template name", () => {
    expect(() => renderEmailTemplate("nonexistent", {})).toThrow("Unknown email template")
  })

  it("throws on name containing ..", () => {
    expect(() => renderEmailTemplate("../etc/passwd", {})).toThrow("Invalid template name")
  })

  it("throws on name containing /", () => {
    expect(() => renderEmailTemplate("foo/bar", {})).toThrow("Invalid template name")
  })

  it("throws on name containing \\", () => {
    expect(() => renderEmailTemplate("foo\\bar", {})).toThrow("Invalid template name")
  })

  it("throws on empty name", () => {
    expect(() => renderEmailTemplate("", {})).toThrow("Invalid template name")
  })
})

describe("renderEmailTemplate — missing variables", () => {
  it("leaves missing variables as empty string (no {{ }} in output)", () => {
    const { html, text } = renderEmailTemplate("budget_alert", {})
    expect(html).not.toContain("{{")
    expect(text).not.toContain("{{")
  })
})

// ── sendTemplatedEmail ────────────────────────────────────────────────────────

describe("sendTemplatedEmail", () => {
  it("calls sendEmail with interpolated html and text", async () => {
    const result = await sendTemplatedEmail("user@example.com", "Alert", "budget_alert", {
      ratio_pct: 80,
      category: "Dining",
      month_label: "May 2026",
      spent_kd: "160.000",
      budget_kd: "200.000",
    })
    expect(result).toBe(true)
    expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce()
    const [to, subject, html, text] = vi.mocked(sendEmail).mock.calls[0]!
    expect(to).toBe("user@example.com")
    expect(subject).toBe("Alert")
    expect(html).toContain("80%")
    expect(text).toContain("80%")
  })

  it("returns false when sendEmail returns false", async () => {
    vi.mocked(sendEmail).mockResolvedValueOnce(false)
    const result = await sendTemplatedEmail("user@example.com", "Alert", "budget_alert", {})
    expect(result).toBe(false)
  })
})
