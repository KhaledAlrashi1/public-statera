// MOB-R62 E / MOB-R63 D / RM-27 — the one normalizer for user-typed amount text. Every amount box
// built on MoneyInput (and /log's keypad) reads it through parseAmountText, so a pasted "1,500" or
// Arabic-Indic digits are read, not silently stripped. No parseFloat, no Number: the result is an
// exact 3-decimal string.
//
// Rules, in order (MOB-R63 D2):
//   1. U+0660-U+0669 and U+06F0-U+06F9 become 0-9; U+066B (Arabic decimal separator) becomes ".";
//      U+066C (Arabic thousands separator) and spaces are removed.
//   2. The device's decimal separator is read from the browser locale (Intl.NumberFormat
//      formatToParts of 1.5). If it is ",": exactly one separator ("," or ".") is the decimal
//      point, and more than one separator in total is refused.
//   3. Otherwise "," is a thousands separator, accepted only in groups of three in the whole
//      part ("1,500", "12,500.250"); any other "," ("1,5", "1,2,3") is refused.
//   4. What is left must be digits with at most one "." and at most 3 decimals; anything else
//      (letters, a second ".", a 4th decimal) is refused, never stripped or truncated (RM-27: no
//      character of an amount is dropped silently). A lone "." is still empty.

export type AmountText =
  | { kind: "empty" }
  | { kind: "ok"; kd: string; clean: string }
  | { kind: "refused" }

export const MAX_AMOUNT_DECIMALS = 3

const ARABIC_INDIC = /[\u0660-\u0669]/g
const EXTENDED_ARABIC_INDIC = /[\u06F0-\u06F9]/g

/** The browser locale's decimal separator ("." or ","), from Intl. */
export function localeDecimalSeparator(): string {
  try {
    const part = new Intl.NumberFormat().formatToParts(1.5).find((p) => p.type === "decimal")
    return part?.value === "," ? "," : "."
  } catch {
    return "."
  }
}

const REFUSED: AmountText = { kind: "refused" }

export function parseAmountText(raw: string, decimalSeparator: string = localeDecimalSeparator()): AmountText {
  let s = raw
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066B/g, ".")
    .replace(/[\u066C\s]/g, "")

  // The final shape check below refuses any "," left over and any second ".". That one check is
  // what makes "more than one separator" refused on a "," device and a "," after the point refused
  // on a "." device; separate checks for those would never be reached.
  if (decimalSeparator === ",") {
    s = s.replace(",", ".")
  } else if (s.includes(",")) {
    const dot = s.indexOf(".")
    const whole = dot === -1 ? s : s.slice(0, dot)
    const rest = dot === -1 ? "" : s.slice(dot)
    if (!/^[0-9]{1,3}(,[0-9]{3})+$/.test(whole)) return REFUSED
    s = whole.replace(/,/g, "") + rest
  }

  if (s === "" || s === ".") return { kind: "empty" }
  const m = /^([0-9]*)(?:\.([0-9]*))?$/.exec(s)
  if (!m || !/[0-9]/.test(s)) return REFUSED
  const [, intRaw, decRaw = ""] = m
  if (decRaw.length > MAX_AMOUNT_DECIMALS) return REFUSED
  const intPart = intRaw.replace(/^0+(?=[0-9])/, "") || "0"
  // clean: the text after the rules, before padding ("1,500" -> "1500"); kd: the exact 3-decimal value.
  return { kind: "ok", kd: `${intPart}.${decRaw.padEnd(MAX_AMOUNT_DECIMALS, "0")}`, clean: s }
}

/** "1500.000" -> "KD 1,500.000": exact, from the string, no float. */
export function formatAmountReadout(kd: string): string {
  const [intPart, decPart] = kd.split(".")
  return `KD ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decPart}`
}

/** The refusal line shown under a box whose text cannot be read as an amount (provisional). */
export const AMOUNT_REFUSED_MESSAGE = "Can't read this amount."
