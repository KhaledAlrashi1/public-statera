import { describe, expect, it, vi } from "vitest"

import {
  validateOptionalTextMaxLength,
  validatePositiveAmount,
  validateRequiredDate,
} from "./validation"

describe("validateRequiredDate", () => {
  it("rejects future dates", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-09T12:00:00Z"))

    expect(validateRequiredDate("2026-03-10")).toEqual({
      tone: "error",
      message: "Date cannot be in the future.",
    })

    vi.useRealTimers()
  })

  it("accepts today's date", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-09T12:00:00Z"))

    expect(validateRequiredDate("2026-03-09")).toEqual({
      tone: "valid",
      message: "Date looks good.",
    })

    vi.useRealTimers()
  })
})

describe("validatePositiveAmount", () => {
  it("rejects values with more than 3 decimal places", () => {
    expect(validatePositiveAmount("1.2345", "Amount")).toEqual({
      tone: "error",
      message: "Amount cannot have more than 3 decimal places.",
    })
  })
})

describe("validateOptionalTextMaxLength", () => {
  it("rejects profile names longer than the configured maximum", () => {
    expect(validateOptionalTextMaxLength("a".repeat(65), "First name", 64)).toEqual({
      tone: "error",
      message: "First name must be 64 characters or fewer.",
    })
  })

  it("allows empty and in-range values", () => {
    expect(validateOptionalTextMaxLength("", "First name", 64)).toBeNull()
    expect(validateOptionalTextMaxLength("A".repeat(64), "First name", 64)).toBeNull()
  })
})
