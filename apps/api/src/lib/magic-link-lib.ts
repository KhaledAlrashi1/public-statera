/*
 * Magic-link sign-in token primitives (Module 10e-1).
 *
 * Mint / hash / normalize / expiry ONLY. No routes, no DB access, no email — 10e-2 mounts
 * the request endpoint and 10e-3a the verify endpoint; both consume this module.
 *
 * Deliberate deviations / design notes:
 * - The RAW token is returned to the caller exactly once and is NEVER persisted. Only
 *   hashMagicLinkToken(raw) reaches the database (magic_link_tokens.token_hash). A DB read
 *   must not yield a usable sign-in token, which is why lib/crypto.ts (enc1: AES-256-GCM)
 *   is deliberately NOT used here — it is reversible, and reversibility is the property
 *   being avoided.
 * - The hash is an UNSALTED SHA-256. Correct here, not a shortcut: the pre-image is 256
 *   bits of uniform CSPRNG output, so there is no dictionary to build and a salt would only
 *   defend against a rainbow table that cannot exist. (Contrast lib/totp-lib.ts, which
 *   bcrypts backup codes — those are 8 hex chars, i.e. 32 bits, and genuinely brute-forcible.)
 * - Raw-token encoding is base64url, not hex: it is URL-safe by construction (the token
 *   travels in a mailed link), needs no percent-encoding, and carries the same 256 bits in
 *   43 characters rather than 64. The STORED hash is hex, which is what fixes token_hash at
 *   varchar(64).
 * - normalizeEmail is trim + lowercase ONLY. Never Gmail dot-stripping, never +tag removal:
 *   both are provider-specific aliasing rules, and applying them would silently merge
 *   addresses that other providers treat as distinct mailboxes — i.e. deliver a sign-in link
 *   for account A to the holder of account B. The user-visible cost of not applying them is
 *   that a+tag@x.com and a@x.com are two accounts, which is correct under every provider.
 *   This is byte-identical to the normalization inside hashEmail (lib/account-deletion.ts);
 *   it is duplicated rather than shared to avoid an account-deletion → magic-link dependency
 *   edge, and the agreement is pinned by a test rather than left to inspection.
 * - Case-insensitivity of the users.email lookup does NOT depend on this function: the column
 *   collation is utf8mb4_0900_ai_ci, so the DB already matches case- and accent-insensitively.
 *   Normalization governs what is STORED, so that magic_link_tokens.email is comparable to
 *   users.email without relying on collation semantics at every call site.
 */

import { createHash, randomBytes } from "node:crypto"

/** Bytes of CSPRNG entropy per token. 32 bytes = 256 bits. */
export const MAGIC_LINK_TOKEN_BYTES = 32

/**
 * Link lifetime. 15 minutes is the value the user-facing copy states verbatim
 * (10e-R14: "Links expire after 15 minutes, and requesting a new link replaces any
 * earlier one."), so changing it here requires changing that string too.
 */
export const MAGIC_LINK_TTL_SECONDS = 15 * 60

/**
 * Mint a fresh raw token. Returned to the caller once, embedded in the mailed URL, and
 * never stored. Callers persist hashMagicLinkToken(raw), not this value.
 */
export function mintMagicLinkToken(): string {
  return randomBytes(MAGIC_LINK_TOKEN_BYTES).toString("base64url")
}

/**
 * SHA-256 hex of a raw token — the value stored in magic_link_tokens.token_hash and the
 * value looked up on verify. Exactly 64 lowercase hex chars, matching varchar(64).
 */
export function hashMagicLinkToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex")
}

/**
 * Trim + lowercase ONLY. See the file-top note: no provider-specific aliasing, ever.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Absolute expiry instant for a token minted at `now` (default: the current time). */
export function magicLinkExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + MAGIC_LINK_TTL_SECONDS * 1000)
}
