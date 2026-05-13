import { describe, it, expect } from "vitest"
import { authenticator } from "otplib"
import {
  normalizeTotpInput,
  generateTotpSecret,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCodes,
  parseBackupCodeHashes,
  verifyAndConsumeBackupCode,
} from "./totp-lib"

// ── normalizeTotpInput ────────────────────────────────────────────────────────

describe("normalizeTotpInput", () => {
  it("strips leading and trailing whitespace", () => {
    expect(normalizeTotpInput("  123456  ")).toBe("123456")
  })

  it("collapses internal whitespace (matches Flask _normalize_auth_code)", () => {
    expect(normalizeTotpInput("abc d - ef")).toBe("abcd-ef")
  })

  it("handles null and undefined", () => {
    expect(normalizeTotpInput(null)).toBe("")
    expect(normalizeTotpInput(undefined)).toBe("")
  })

  it("returns empty string for all-whitespace input", () => {
    expect(normalizeTotpInput("   ")).toBe("")
  })
})

// ── generateTotpSecret ────────────────────────────────────────────────────────

describe("generateTotpSecret", () => {
  it("returns a non-empty base32 string", () => {
    const secret = generateTotpSecret()
    expect(typeof secret).toBe("string")
    expect(secret.length).toBeGreaterThan(0)
    // base32 character set (uppercase letters + 2-7)
    expect(secret).toMatch(/^[A-Z2-7]+=*$/)
  })

  it("returns unique secrets on each call", () => {
    const s1 = generateTotpSecret()
    const s2 = generateTotpSecret()
    expect(s1).not.toBe(s2)
  })
})

// ── verifyTotpCode ────────────────────────────────────────────────────────────

describe("verifyTotpCode", () => {
  it("accepts a valid current TOTP token", () => {
    const secret = generateTotpSecret()
    const token = authenticator.generate(secret)
    expect(verifyTotpCode(secret, token)).toBe(true)
  })

  it("rejects a wrong 6-digit code", () => {
    const secret = generateTotpSecret()
    expect(verifyTotpCode(secret, "000000")).toBe(false)
  })

  it("rejects empty code", () => {
    const secret = generateTotpSecret()
    expect(verifyTotpCode(secret, "")).toBe(false)
  })

  it("rejects non-digit code", () => {
    const secret = generateTotpSecret()
    expect(verifyTotpCode(secret, "abcdef")).toBe(false)
  })

  it("rejects code with wrong digit count", () => {
    const secret = generateTotpSecret()
    expect(verifyTotpCode(secret, "12345")).toBe(false)
    expect(verifyTotpCode(secret, "1234567")).toBe(false)
  })

  it("rejects empty secret", () => {
    expect(verifyTotpCode("", "123456")).toBe(false)
  })

  it("normalises whitespace in code before verification", () => {
    const secret = generateTotpSecret()
    const token = authenticator.generate(secret)
    // Token with surrounding spaces should still verify
    expect(verifyTotpCode(secret, `  ${token}  `)).toBe(true)
  })
})

// ── generateBackupCodes ───────────────────────────────────────────────────────

describe("generateBackupCodes", () => {
  it("generates 8 codes by default", () => {
    const codes = generateBackupCodes()
    expect(codes).toHaveLength(8)
  })

  it("generates codes in xxxx-xxxx format (4 lower-hex + dash + 4 lower-hex)", () => {
    const codes = generateBackupCodes()
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/)
    }
  })

  it("generates unique codes", () => {
    const codes = generateBackupCodes()
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })

  it("respects a custom count", () => {
    expect(generateBackupCodes(3)).toHaveLength(3)
  })
})

// ── hashBackupCodes / verifyAndConsumeBackupCode ──────────────────────────────

describe("hashBackupCodes + verifyAndConsumeBackupCode", () => {
  it("hashes codes such that the original code verifies successfully", async () => {
    const codes = ["ab12-cd34"]
    const hashes = await hashBackupCodes(codes)
    expect(hashes).toHaveLength(1)
    // Each hash should be a bcrypt hash string
    expect(hashes[0]).toMatch(/^\$2[aby]\$/)

    const { consumed, remainingHashes } = await verifyAndConsumeBackupCode("ab12-cd34", JSON.stringify(hashes))
    expect(consumed).toBe(true)
    expect(remainingHashes).toHaveLength(0)
  })

  it("rejects an incorrect backup code", async () => {
    const codes = ["ab12-cd34"]
    const hashes = await hashBackupCodes(codes)
    const { consumed, remainingHashes } = await verifyAndConsumeBackupCode("zzzz-zzzz", JSON.stringify(hashes))
    expect(consumed).toBe(false)
    expect(remainingHashes).toHaveLength(1)
  })

  it("is case-insensitive (uppercase input normalised to lowercase)", async () => {
    const codes = ["ab12-cd34"]
    const hashes = await hashBackupCodes(codes)
    const { consumed } = await verifyAndConsumeBackupCode("AB12-CD34", JSON.stringify(hashes))
    expect(consumed).toBe(true)
  })

  it("strips whitespace from code before comparison", async () => {
    const codes = ["ab12-cd34"]
    const hashes = await hashBackupCodes(codes)
    const { consumed } = await verifyAndConsumeBackupCode("  ab12-cd34  ", JSON.stringify(hashes))
    expect(consumed).toBe(true)
  })

  it("removes only the consumed code from the list", async () => {
    const codes = ["ab12-cd34", "ef56-gh78", "ij90-kl12"]
    const hashes = await hashBackupCodes(codes)
    const { consumed, remainingHashes } = await verifyAndConsumeBackupCode("ef56-gh78", JSON.stringify(hashes))
    expect(consumed).toBe(true)
    expect(remainingHashes).toHaveLength(2)
  })

  it("returns consumed: false and original hashes for empty code", async () => {
    const hashes = await hashBackupCodes(["ab12-cd34"])
    const { consumed, remainingHashes } = await verifyAndConsumeBackupCode("", JSON.stringify(hashes))
    expect(consumed).toBe(false)
    expect(remainingHashes).toHaveLength(1)
  })
})

// ── parseBackupCodeHashes ────────────────────────────────────────────────────

describe("parseBackupCodeHashes", () => {
  it("returns empty array for null", () => {
    expect(parseBackupCodeHashes(null)).toEqual([])
  })

  it("returns empty array for malformed JSON", () => {
    expect(parseBackupCodeHashes("{not json}")).toEqual([])
  })

  it("returns empty array for non-array JSON", () => {
    expect(parseBackupCodeHashes('{"a":1}')).toEqual([])
  })

  it("filters out non-string entries", () => {
    expect(parseBackupCodeHashes('[1, "hash", null, "hash2"]')).toEqual(["hash", "hash2"])
  })
})
