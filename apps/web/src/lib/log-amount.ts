// MOB-R53 B3 — the /log keypad's amount, kept as a STRING end to end. No parseFloat, no Number:
// the keypad builds a string, normalizeAmount() pads it to 3 decimals for the API, and totals are
// summed exactly as integer fils (BigInt), never as floats.
import { parseAmountText } from "./amount-text"

export const MAX_INTEGER_DIGITS = 6
export const MAX_DECIMALS = 3

/** Append a digit, respecting the integer and decimal caps. A lone "0" is replaced. */
export function pressDigit(amount: string, digit: string): string {
  if (!/^[0-9]$/.test(digit)) return amount
  const dot = amount.indexOf(".")
  if (dot === -1) {
    if (amount === "0") return digit
    if (amount.length >= MAX_INTEGER_DIGITS) return amount
    return amount + digit
  }
  if (amount.length - dot - 1 >= MAX_DECIMALS) return amount
  return amount + digit
}

/** Add the decimal point once; a leading point becomes "0.". */
export function pressDecimal(amount: string): string {
  if (amount.includes(".")) return amount
  return amount === "" ? "0." : `${amount}.`
}

export function pressDelete(amount: string): string {
  return amount.slice(0, -1)
}

/**
 * The amount as the API's 3-decimal string ("1.25" -> "1.250", "7." -> "7.000"), or null when
 * there is no positive amount ("", "0.", "0.000").
 */
export function normalizeAmount(amount: string): string | null {
  // MOB-R62 E / RM-27 — read through the one normalizer shared with every typed amount box.
  const parsed = parseAmountText(amount)
  if (parsed.kind !== "ok") return null
  return /[1-9]/.test(parsed.kd) ? parsed.kd : null
}

/** "1.250" -> 1250n. Input must already be a normalized 3-decimal string. */
export function toFils(kd: string): bigint {
  const [i, d = ""] = kd.split(".")
  return BigInt(i) * 1000n + BigInt(d.padEnd(3, "0").slice(0, 3) || "0")
}

/** 1250n -> "1.250". */
export function filsToKd(fils: bigint): string {
  const whole = fils / 1000n
  const frac = fils % 1000n
  return `${whole}.${frac.toString().padStart(3, "0")}`
}

/** Exact sum of normalized 3-decimal strings, as a 3-decimal string. */
export function sumKd(amounts: string[]): string {
  return filsToKd(amounts.reduce((acc, a) => acc + toFils(a), 0n))
}
