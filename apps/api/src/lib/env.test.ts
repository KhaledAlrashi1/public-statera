import { describe, it, expect, afterEach } from "vitest"
import { optional } from "./env"

const TEST_KEY = "__STATERA_TEST_OPTIONAL__"

afterEach(() => {
  delete process.env[TEST_KEY]
})

describe("optional()", () => {
  it("falls back when env var is empty string", () => {
    process.env[TEST_KEY] = ""
    expect(optional(TEST_KEY, "fallback")).toBe("fallback")
  })

  it("falls back when env var is undefined", () => {
    delete process.env[TEST_KEY]
    expect(optional(TEST_KEY, "fallback")).toBe("fallback")
  })

  it("passes through a valid non-empty value", () => {
    process.env[TEST_KEY] = "real-value"
    expect(optional(TEST_KEY, "fallback")).toBe("real-value")
  })
})
