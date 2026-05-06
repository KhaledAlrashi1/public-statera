/**
 * Field-level AES-256-GCM encryption.
 *
 * Wire format matches the Python cryptography library implementation exactly:
 *   enc1:<url-safe-base64(nonce[12] || ciphertext || auth-tag[16])>
 *
 * This means ciphertext produced by the Python backend can be decrypted here
 * and vice versa — useful for future data migrations.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { env } from "./env"

const ENC_PREFIX = "enc1:"
const NONCE_BYTES = 12
const TAG_BYTES = 16

let _currentKey: Buffer | null = null
let _previousKey: Buffer | null = null
let _initialized = false

function hexToBuffer(hex: string): Buffer {
  const stripped = hex.trim()
  if (stripped.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes); got ${stripped.length} chars.`,
    )
  }
  return Buffer.from(stripped, "hex")
}

function loadKeys(): void {
  _currentKey = hexToBuffer(env.encryptionKey)
  if (env.encryptionKeyPrevious) {
    try {
      _previousKey = hexToBuffer(env.encryptionKeyPrevious)
    } catch {
      console.warn("ENCRYPTION_KEY_PREVIOUS is set but invalid; ignoring previous key.")
      _previousKey = null
    }
  }
  _initialized = true
}

function ensureInitialized(): void {
  if (!_initialized) loadKeys()
}

export function encrypt(plaintext: string): string {
  ensureInitialized()
  const key = _currentKey!
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv("aes-256-gcm", key, nonce)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // Layout: nonce || ciphertext || tag  (matches Python AESGCM output)
  const blob = Buffer.concat([nonce, encrypted, tag])
  return ENC_PREFIX + blob.toString("base64url")
}

export function decrypt(value: string): string {
  ensureInitialized()
  if (!value.startsWith(ENC_PREFIX)) return value  // legacy plaintext pass-through

  const raw = Buffer.from(value.slice(ENC_PREFIX.length), "base64url")
  if (raw.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error("Encrypted value is too short to contain a valid nonce and tag.")
  }

  const nonce = raw.subarray(0, NONCE_BYTES)
  const ciphertext = raw.subarray(NONCE_BYTES, raw.length - TAG_BYTES)
  const tag = raw.subarray(raw.length - TAG_BYTES)

  for (const key of [_currentKey, _previousKey]) {
    if (!key) continue
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, nonce)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
    } catch {
      continue
    }
  }

  throw new Error(
    "Failed to decrypt field: neither the current nor the previous key matched. " +
      "Check ENCRYPTION_KEY and ENCRYPTION_KEY_PREVIOUS.",
  )
}

export function resetForTesting(keyHex?: string): void {
  _initialized = false
  _currentKey = null
  _previousKey = null
  if (keyHex) {
    _currentKey = hexToBuffer(keyHex)
    _initialized = true
  }
}
