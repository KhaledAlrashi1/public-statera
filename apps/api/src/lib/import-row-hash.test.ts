import { describe, it, expect } from "vitest"
import { computeImportRowHash } from "./import-row-hash"

// Expected digest computed by running the Python reference implementation once:
//   import hashlib
//   raw = "1:2026-04-15:starbucks:12.500:abc123:0"
//   print(hashlib.sha256(raw.encode("utf-8")).hexdigest())
const EXPECTED = "19e658c0adb96b37fa8ce733926cc3578f08ebfaea1d5414f6e544a7a9f29059"

describe("computeImportRowHash", () => {
  it("produces the same hex digest as Python's sha256 on the identical UTF-8 input", () => {
    const result = computeImportRowHash({
      userId: 1,
      dateStr: "2026-04-15",
      nameKey: "starbucks",
      amountKd: "12.500",
      fileHash: "abc123",
      rowIndex: 0,
    })
    expect(result).toBe(EXPECTED)
  })
})
