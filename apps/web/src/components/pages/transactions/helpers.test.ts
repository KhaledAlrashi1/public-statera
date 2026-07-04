import { vi, describe as viDescribe, it, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

import {
  applyTransactionSuggestion,
  normalizeAmountForInput,
  normalizeDateForInput,
  useSuggestions,
} from "./helpers"

vi.mock("@/lib/api", () => ({
  transactionsApi: {
    suggestions: vi.fn(),
  },
}))

import { transactionsApi } from "@/lib/api"
const mockSuggestions = vi.mocked(transactionsApi.suggestions)

viDescribe("useSuggestions error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns items on success", async () => {
    mockSuggestions.mockResolvedValueOnce({
      items: [{ name: "Coffee", category: "Food", merchant: "Starbucks" }],
    } as never)
    const { result } = renderHook(() => useSuggestions())
    await act(async () => { await result.current.fetchSuggestions("cof") })
    expect(result.current.suggestions).toHaveLength(1)
    expect(result.current.suggestions[0].name).toBe("Coffee")
  })

  it("always logs to console.error when fetch rejects", async () => {
    mockSuggestions.mockRejectedValueOnce(new Error("500 Internal Server Error"))
    const { result } = renderHook(() => useSuggestions())
    // In test mode import.meta.env.DEV is true, so the error re-throws; swallow it here
    // — the assertion target is the logging contract, not the throw behavior.
    try { await act(async () => { await result.current.fetchSuggestions("co") }) } catch { /* expected */ }
    expect(console.error).toHaveBeenCalledWith(
      "Failed to fetch transaction suggestions:",
      expect.any(Error),
    )
  })

  it("re-throws in dev/test mode so regressions surface immediately", async () => {
    // import.meta.env.DEV is true in test mode — this path is always exercised here.
    mockSuggestions.mockRejectedValueOnce(new Error("column is_pinned does not exist"))
    const { result } = renderHook(() => useSuggestions())
    await expect(
      act(async () => { await result.current.fetchSuggestions("co") })
    ).rejects.toThrow("column is_pinned does not exist")
    expect(console.error).toHaveBeenCalledWith(
      "Failed to fetch transaction suggestions:",
      expect.any(Error),
    )
  })

  it("does not fetch for queries shorter than 2 characters", async () => {
    const { result } = renderHook(() => useSuggestions())
    await act(async () => { await result.current.fetchSuggestions("c") })
    expect(mockSuggestions).not.toHaveBeenCalled()
  })

  it("uses cache on repeated identical queries", async () => {
    mockSuggestions.mockResolvedValueOnce({
      items: [{ name: "Grocery", category: "Food", merchant: "" }],
    } as never)
    const { result } = renderHook(() => useSuggestions())
    await act(async () => { await result.current.fetchSuggestions("gr") })
    await act(async () => { await result.current.fetchSuggestions("gr") })
    expect(mockSuggestions).toHaveBeenCalledTimes(1)
  })
})

describe("transactions/helpers", () => {
  test("normalizeDateForInput accepts date strings and unix fallback", () => {
    expect(normalizeDateForInput("2026-02-18")).toBe("2026-02-18")
    expect(normalizeDateForInput("2026-02-18T10:20:30Z")).toBe("2026-02-18")
    expect(normalizeDateForInput("", 1739836800)).toBe("2025-02-18")
    expect(normalizeDateForInput("bad-value")).toBe("")
  })

  test("normalizeAmountForInput normalizes numeric strings", () => {
    expect(normalizeAmountForInput("1,234.5")).toBe("1234.500")
    expect(normalizeAmountForInput("0")).toBe("0.000")
    expect(normalizeAmountForInput("raw")).toBe("raw")
    expect(normalizeAmountForInput("")).toBe("")
  })

  describe("applyTransactionSuggestion", () => {
    function makeSetters() {
      const name = { value: "" }
      const category = { value: "" }
      const merchant = { value: "" }
      return {
        setName: (v: string) => { name.value = v },
        setCategory: (v: string) => { category.value = v },
        setMerchant: (v: string) => { merchant.value = v },
        name, category, merchant,
      }
    }

    test("fills category from suggestion when current category is empty", () => {
      const s = makeSetters()
      applyTransactionSuggestion(
        { name: "KFC", category: { id: 1, name: "Dining" }, merchant: { id: 1, name: "KFC Kuwait" } },
        s.setName, s.setCategory, s.setMerchant, "", ""
      )
      expect(s.name.value).toBe("KFC")
      expect(s.category.value).toBe("Dining")
      expect(s.merchant.value).toBe("KFC Kuwait")
    })

    test("does not overwrite a non-empty category already set by the user", () => {
      const s = makeSetters()
      s.setCategory("Food")
      applyTransactionSuggestion(
        { name: "KFC", category: "Dining", merchant: "KFC Kuwait" },
        s.setName, s.setCategory, s.setMerchant, "", "Food"
      )
      expect(s.category.value).toBe("Food")
    })

    test("does not overwrite category when current is non-empty and suggestion is null", () => {
      const s = makeSetters()
      s.setCategory("Transport")
      applyTransactionSuggestion(
        { name: "Taxi", category: null, merchant: "" },
        s.setName, s.setCategory, s.setMerchant, "", "Transport"
      )
      expect(s.category.value).toBe("Transport")
    })

    test("null category from backend resolves to empty string when current is empty", () => {
      const s = makeSetters()
      applyTransactionSuggestion(
        { name: "KFC", category: null, merchant: "KFC Kuwait" },
        s.setName, s.setCategory, s.setMerchant, "existing-merchant", ""
      )
      expect(s.category.value).toBe("")
    })

    test("empty-string category from backend leaves category empty when current is empty", () => {
      const s = makeSetters()
      applyTransactionSuggestion(
        { name: "KFC", category: "", merchant: "" },
        s.setName, s.setCategory, s.setMerchant, "existing-merchant", ""
      )
      expect(s.category.value).toBe("")
    })

    test("falls back to currentMerchant when suggestion has no merchant", () => {
      const s = makeSetters()
      applyTransactionSuggestion(
        { name: "KFC", category: "Dining", merchant: "" },
        s.setName, s.setCategory, s.setMerchant, "My Saved Merchant", ""
      )
      expect(s.merchant.value).toBe("My Saved Merchant")
    })

    test("suggestion merchant takes precedence over currentMerchant", () => {
      const s = makeSetters()
      applyTransactionSuggestion(
        { name: "KFC", category: { id: 1, name: "Dining" }, merchant: { id: 1, name: "KFC Kuwait" } },
        s.setName, s.setCategory, s.setMerchant, "Old Merchant", ""
      )
      expect(s.merchant.value).toBe("KFC Kuwait")
    })
  })
})
