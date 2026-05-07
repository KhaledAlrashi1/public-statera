import { createHash } from "node:crypto"

/**
 * Compute the SHA-256 import row hash used to detect re-imports of the same
 * CSV/XLSX row. Port of Flask's:
 *
 *   sha256(f"{user_id}:{date_str}:{name_key}:{amount_kd}:{file_hash}:{row_index}"
 *          .encode("utf-8")).hexdigest()
 *
 * amount_kd must be the canonical 3-decimal string (e.g. "12.500"), exactly
 * as stored in the DB, so the hash is stable across re-imports.
 */
export function computeImportRowHash(params: {
  userId: number
  dateStr: string    // "YYYY-MM-DD"
  nameKey: string    // result of buildNameKey()
  amountKd: string   // formatKd() output, e.g. "12.500"
  fileHash: string
  rowIndex: number
}): string {
  const { userId, dateStr, nameKey, amountKd, fileHash, rowIndex } = params
  const raw = `${userId}:${dateStr}:${nameKey}:${amountKd}:${fileHash}:${rowIndex}`
  return createHash("sha256").update(raw, "utf8").digest("hex")
}
