/*
 * Deliberate deviations from Flask (backend/routers/auth.py):
 * - pyotp → otplib v12: same RFC 6238; window=1 matches pyotp's valid_window=1 (±1 step).
 * - Python bcrypt → bcryptjs: same Blowfish hash format, same cost factor (12); hashes are
 *   interoperable. bcryptjs chosen over native bcrypt to avoid node-gyp build complexity.
 * - Python qrcode lib → qrcode npm: same TOTP provisioning URI rendered as PNG → base64 data URI.
 * - secrets.token_hex(2) → randomBytes(2).toString('hex'): 4 lowercase hex chars, 32-bit total
 *   entropy per code (xxxx-xxxx). Format and entropy are identical.
 */

import { authenticator } from "otplib"
import bcrypt from "bcryptjs"
import QRCode from "qrcode"
import { randomBytes } from "node:crypto"

// Match Flask: TOTP_DIGITS=6, TOTP_PERIOD_SECONDS=30, valid_window=1 (±1 period = ±30 s).
authenticator.options = { digits: 6, step: 30, window: 1 }

const BACKUP_CODE_COUNT = 10
// Cost 12 matches Python bcrypt's default. Infrequent (10 codes per setup event).
const BCRYPT_ROUNDS = 12
const ISSUER = "Statera"

// ── Input normalisation (matches Flask's _normalize_auth_code exactly) ─────────
// Flask: "".join((raw or "").strip().split()) — strips + collapses all internal whitespace.
export function normalizeTotpInput(raw: string | null | undefined): string {
  return (raw ?? "").trim().split(/\s+/).join("")
}

// ── TOTP ──────────────────────────────────────────────────────────────────────

export function generateTotpSecret(): string {
  return authenticator.generateSecret()
}

// decryptedSecret is the plaintext base32 secret (caller handles decrypt()).
// Shaped for both the enable flow and future DELETE /api/account caller.
export function verifyTotpCode(decryptedSecret: string, rawCode: string): boolean {
  const secret = (decryptedSecret ?? "").trim()
  const code = normalizeTotpInput(rawCode)
  if (!secret || !code) return false
  if (!/^\d{6}$/.test(code)) return false
  try {
    return authenticator.verify({ token: code, secret })
  } catch {
    return false
  }
}

export async function generateTotpQrDataUri(secret: string, email: string): Promise<string> {
  const uri = authenticator.keyuri(email, ISSUER, secret)
  return QRCode.toDataURL(uri)
}

// ── Backup codes ──────────────────────────────────────────────────────────────
// Format: xxxx-xxxx (4 lower-hex + dash + 4 lower-hex). Matches Flask's:
//   secrets.token_hex(2) + "-" + secrets.token_hex(2)

export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: Math.max(1, count) }, () => {
    const left = randomBytes(2).toString("hex")
    const right = randomBytes(2).toString("hex")
    return `${left}-${right}`
  })
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(
    codes.map((code) => bcrypt.hash(normalizeTotpInput(code).toLowerCase(), BCRYPT_ROUNDS)),
  )
}

export function parseBackupCodeHashes(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === "string" && !!x)
  } catch {
    return []
  }
}

// Returns { consumed, remainingHashes } — caller persists remainingHashes to DB.
// Normalized + lowercased before bcrypt compare (matches Flask's _consume_backup_code).
export async function verifyAndConsumeBackupCode(
  rawCode: string,
  hashesJson: string | null | undefined,
): Promise<{ consumed: boolean; remainingHashes: string[] }> {
  const normalized = normalizeTotpInput(rawCode).toLowerCase()
  const hashes = parseBackupCodeHashes(hashesJson)
  if (!normalized || hashes.length === 0) return { consumed: false, remainingHashes: hashes }
  for (let i = 0; i < hashes.length; i++) {
    try {
      if (await bcrypt.compare(normalized, hashes[i]!)) {
        const remainingHashes = [...hashes.slice(0, i), ...hashes.slice(i + 1)]
        return { consumed: true, remainingHashes }
      }
    } catch {
      continue
    }
  }
  return { consumed: false, remainingHashes: hashes }
}
