/**
 * Unit tests for lib/magic-link-lib.ts — mint / hash / normalize / expiry (10e-1).
 *
 * Hermetic: pure functions, no DB, no Redis, no network.
 */

import { describe, it, expect } from "vitest"
import {
  MAGIC_LINK_TOKEN_BYTES,
  MAGIC_LINK_TTL_SECONDS,
  hashMagicLinkToken,
  magicLinkExpiry,
  mintMagicLinkToken,
  normalizeEmail,
} from "./magic-link-lib"
import { hashEmail } from "./account-deletion"

// ── mintMagicLinkToken ────────────────────────────────────────────────────────

describe("mintMagicLinkToken", () => {
  it("emits URL-safe base64url with no padding or percent-encodable characters", () => {
    // The token travels in a mailed URL; +, / and = would need escaping.
    expect(mintMagicLinkToken()).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("carries the full 256 bits of entropy (43 base64url chars for 32 bytes)", () => {
    const expectedLength = Math.ceil((MAGIC_LINK_TOKEN_BYTES * 8) / 6)
    expect(mintMagicLinkToken()).toHaveLength(expectedLength)
    expect(Buffer.from(mintMagicLinkToken(), "base64url")).toHaveLength(MAGIC_LINK_TOKEN_BYTES)
  })

  it("never repeats across a large sample (CSPRNG, not a counter or a seeded PRNG)", () => {
    const sample = new Set(Array.from({ length: 1000 }, () => mintMagicLinkToken()))
    expect(sample.size).toBe(1000)
  })
})

// ── hashMagicLinkToken ────────────────────────────────────────────────────────

describe("hashMagicLinkToken", () => {
  it("produces exactly 64 lowercase hex chars — the varchar(64) column width", () => {
    expect(hashMagicLinkToken(mintMagicLinkToken())).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is deterministic for the same raw token (the verify lookup depends on this)", () => {
    const raw = mintMagicLinkToken()
    expect(hashMagicLinkToken(raw)).toBe(hashMagicLinkToken(raw))
  })

  it("is one-way: the stored hash never equals or contains the raw token", () => {
    const raw = mintMagicLinkToken()
    const hash = hashMagicLinkToken(raw)
    expect(hash).not.toBe(raw)
    expect(hash).not.toContain(raw)
  })

  it("differs for different raw tokens", () => {
    expect(hashMagicLinkToken("token-a")).not.toBe(hashMagicLinkToken("token-b"))
  })

  it("is case-SENSITIVE on the raw token (base64url is case-significant)", () => {
    // A lookup that lowercased the token before hashing would collapse distinct tokens.
    expect(hashMagicLinkToken("AbCd")).not.toBe(hashMagicLinkToken("abcd"))
  })

  it("matches an independently computed SHA-256 (pins the algorithm, not just self-consistency)", () => {
    // Known answer: SHA-256("abc").
    expect(hashMagicLinkToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })
})

// ── normalizeEmail ────────────────────────────────────────────────────────────

describe("normalizeEmail", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com")
  })

  it("lowercases", () => {
    expect(normalizeEmail("User@Example.COM")).toBe("user@example.com")
  })

  it("trims and lowercases together", () => {
    expect(normalizeEmail("\t User@Example.COM \n")).toBe("user@example.com")
  })

  it("is idempotent", () => {
    const once = normalizeEmail("  User@Example.COM ")
    expect(normalizeEmail(once)).toBe(once)
  })

  // The two BLOCKING negative pins: normalization must NOT merge provider aliases.
  it("does NOT strip dots — a dotted address stays DISTINCT from its undotted form", () => {
    expect(normalizeEmail("first.last@example.com")).toBe("first.last@example.com")
    expect(normalizeEmail("first.last@example.com")).not.toBe(normalizeEmail("firstlast@example.com"))
  })

  it("does NOT remove +tags — a tagged address stays DISTINCT from its untagged form", () => {
    expect(normalizeEmail("user+statera@example.com")).toBe("user+statera@example.com")
    expect(normalizeEmail("user+statera@example.com")).not.toBe(normalizeEmail("user@example.com"))
  })

  it("leaves the local part otherwise byte-identical (no unicode folding beyond case)", () => {
    expect(normalizeEmail("José@example.com")).toBe("josé@example.com")
  })

  it("agrees with hashEmail's own normalization (pins the deliberate duplication)", () => {
    // account-deletion.hashEmail trims+lowercases internally. If either side drifts, a
    // tombstone written from a stored (already-normalized) address would stop matching.
    for (const raw of ["  User@Example.COM ", "a+b@x.com", "first.last@example.com"]) {
      expect(hashEmail(raw)).toBe(hashEmail(normalizeEmail(raw)))
    }
  })
})

// ── magicLinkExpiry ───────────────────────────────────────────────────────────

describe("magicLinkExpiry", () => {
  it("is exactly MAGIC_LINK_TTL_SECONDS after the supplied instant", () => {
    const now = new Date("2026-08-08T12:00:00.000Z")
    expect(magicLinkExpiry(now).toISOString()).toBe("2026-08-08T12:15:00.000Z")
    expect(magicLinkExpiry(now).getTime() - now.getTime()).toBe(MAGIC_LINK_TTL_SECONDS * 1000)
  })

  it("is 15 minutes — the value the user-facing expiry copy states verbatim (10e-R14)", () => {
    expect(MAGIC_LINK_TTL_SECONDS).toBe(900)
  })

  it("does not mutate the instant it is given", () => {
    const now = new Date("2026-08-08T12:00:00.000Z")
    magicLinkExpiry(now)
    expect(now.toISOString()).toBe("2026-08-08T12:00:00.000Z")
  })

  it("defaults to the current time when called with no argument", () => {
    const before = Date.now()
    const exp = magicLinkExpiry().getTime()
    const after = Date.now()
    expect(exp).toBeGreaterThanOrEqual(before + MAGIC_LINK_TTL_SECONDS * 1000)
    expect(exp).toBeLessThanOrEqual(after + MAGIC_LINK_TTL_SECONDS * 1000)
  })
})
