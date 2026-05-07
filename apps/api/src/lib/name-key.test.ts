import { describe, it, expect } from "vitest"
import { buildNameKey } from "./name-key"

// Expected values computed from the Python reference implementation:
//   " ".join((name or "").split()).lower()[:255] or "?"
// Run once with known inputs; hardcoded here as regression anchors.

describe("buildNameKey", () => {
  it("lowercases and collapses ASCII whitespace", () => {
    expect(buildNameKey("  Hello   World  ")).toBe("hello world")
  })

  it("leaves already-clean ASCII unchanged", () => {
    expect(buildNameKey("coffee shop")).toBe("coffee shop")
  })

  it("collapses multiple spaces in Arabic merchant name", () => {
    // Python: "سبت  برجر".split() → ["سبت", "برجر"] → "سبت برجر"
    expect(buildNameKey("سبت  برجر")).toBe("سبت برجر")
  })

  it("splits on NBSP (U+00A0) — Python str.split() treats Zs-category as whitespace", () => {
    // Python: "Hello World".split() → ["Hello", "World"] → "hello world"
    expect(buildNameKey("Hello World")).toBe("hello world")
  })

  it("returns '?' for empty string", () => {
    expect(buildNameKey("")).toBe("?")
  })

  it("returns '?' for whitespace-only string", () => {
    expect(buildNameKey("   ")).toBe("?")
  })

  it("returns '?' for null", () => {
    expect(buildNameKey(null)).toBe("?")
  })

  it("truncates at 255 code points, not UTF-16 code units (emoji boundary)", () => {
    // 250 ASCII 'a' chars + 10 😀 (U+1F600, 2 UTF-16 units but 1 code point each).
    // Python [:255] slices 255 code points → 250 'a' + 5 😀.
    // JS .slice(0,255) on raw string would take 255 UTF-16 units → 250 'a' + 2.5 emoji (wrong).
    // [...s].slice(0,255) takes 255 code points → correct match.
    const input = "a".repeat(250) + "\u{1F600}".repeat(10)
    const result = buildNameKey(input)
    const codePoints = [...result]
    expect(codePoints).toHaveLength(255)
    // Last 5 code points must be 😀, not a dangling surrogate half
    expect(codePoints.slice(250)).toEqual(Array(5).fill("😀"))
  })
})
